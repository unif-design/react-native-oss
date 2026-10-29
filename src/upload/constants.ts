export const OSS_UPLOAD_SUCCESS_STATUS = '200';
export const OSS_UPLOAD_MESSAGES = {
  invalid_input: '上传文件或对象路径无效',
  credential: '上传凭证不可用',
  signing: '上传签名失败',
  rejected: 'OSS 拒绝本次上传',
  unconfirmed: '未取得明确的 OSS 上传回执',
  unsupported: '当前环境不支持本地文件上传',
} as const;
export const OSS_UPLOAD_MIME_TYPES: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  pdf: 'application/pdf',
  json: 'application/json',
  txt: 'text/plain',
  csv: 'text/csv',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
export const OSS_UPLOAD_DEFAULT_MIME = 'application/octet-stream';

export const OSS_UPLOAD_FILE_NAME = 'file';

export const OSS_UPLOAD_PROGRESS_INTERVAL_MS = 50;
