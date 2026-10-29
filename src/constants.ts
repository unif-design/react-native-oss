export const OSS_CREDENTIAL_MARGIN_MS = 30_000;
export const OSS_EXPIRATION_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
export const OSS_BUCKET_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
export const OSS_ORIGIN_PATTERN = /^https?:\/\/[^/?#@\\\s]+\/?$/i;
export const OSS_HTTP_SCHEME = /^https?:\/\//i;
export const OSS_CONTROL_CHARACTER_END = 31;
export const OSS_DELETE_CHARACTER = 127;
export const OSS_CREDENTIAL_MESSAGES = {
  access: '上传凭证访问已失效，请重新准备。',
  rejected: '服务未允许获取上传凭证。',
  invalid_response: '上传凭证响应无法确认，请稍后重试。',
  invalid_credential: '未取得有效上传凭证，请稍后重试。',
  unavailable: '暂时无法获取上传凭证，请稍后重试。',
} as const;
