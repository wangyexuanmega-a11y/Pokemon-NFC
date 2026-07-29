/* NFC Manager
 * 处理 NFC 手环/标签触发的宝可梦唤醒逻辑。
 * 支持三种入口：
 *   1. 腕带 NDEF URL：例如 https://example.com/?buddy=pikachu
 *   2. 主动 Web NFC API 扫描：页面常驻监听标签
 *   3. 桌面调试模拟：通过按钮手动触发
 */

export const DEFAULT_BUDDY = 'pikachu';

export class NFCManager {
  constructor({ onAwaken, onError, onStatus } = {}) {
    this.onAwaken = onAwaken;
    this.onError = onError;
    this.onStatus = onStatus;
    this.scanning = false;
  }

  /** 当前浏览器是否支持 Web NFC */
  isSupported() {
    return typeof window !== 'undefined' && 'NDEFReader' in window;
  }

  /** 从当前页面 URL 读取 buddy 参数（腕带 URL 场景） */
  readBuddyFromURL(url = window.location.href) {
    try {
      const params = new URL(url).searchParams;
      const buddy = params.get('buddy');
      return buddy ? buddy.trim() : null;
    } catch {
      return null;
    }
  }

  /**
   * 开始主动扫描 NFC 标签。
   * 注意：Web NFC 需要 HTTPS 或 localhost，且通常要求用户手势触发。
   */
  async startScan() {
    if (!this.isSupported()) {
      this.reportStatus('unsupported');
      return false;
    }
    if (this.scanning) return true;

    try {
      const ndef = new NDEFReader();
      await ndef.scan();
      this.scanning = true;
      this.reportStatus('scanning');

      ndef.addEventListener('reading', (event) => {
        const buddyId = this.parseBuddyId(event.message, event.serialNumber);
        if (buddyId) this.awaken(buddyId);
      });

      ndef.addEventListener('error', (error) => {
        this.scanning = false;
        this.reportError(error);
      });

      return true;
    } catch (error) {
      this.scanning = false;
      this.reportError(error);
      return false;
    }
  }

  /** 解析 NDEFMessage，提取 buddy ID */
  parseBuddyId(message, serialNumber) {
    if (!message || !message.records) return null;

    for (const record of message.records) {
      // 优先读取 URL 中的 ?buddy=xxx 参数
      if (record.recordType === 'url') {
        const url = new TextDecoder().decode(record.data);
        const match = url.match(/[?&]buddy=([^&#]+)/);
        if (match) return decodeURIComponent(match[1]).trim();
      }
      // 纯文本标签直接作为 buddy ID
      if (record.recordType === 'text') {
        const text = new TextDecoder().decode(record.data).trim();
        if (text) return text;
      }
    }

    // 如果标签里没有明确记录，可用序列号做兜底映射
    if (serialNumber) return serialNumber;
    return null;
  }

  awaken(buddyId) {
    if (typeof this.onAwaken === 'function') {
      this.onAwaken(buddyId || DEFAULT_BUDDY);
    }
  }

  reportStatus(status) {
    if (typeof this.onStatus === 'function') this.onStatus(status);
  }

  reportError(error) {
    if (typeof this.onError === 'function') this.onError(error);
    else console.error('[NFC]', error);
  }
}
