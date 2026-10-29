import type {
  FetchBlobResponse,
  StatefulPromise,
} from 'react-native-blob-util';

export interface OssUploadRequest extends Omit<
  StatefulPromise<FetchBlobResponse>,
  'onRequestComplete'
> {
  onRequestComplete?(callback: () => void): StatefulPromise<FetchBlobResponse>;
}
