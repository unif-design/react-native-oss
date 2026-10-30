import type { OssTransferOptions } from '@unif/react-native-oss';

// 宿主保留原目录读取时机，文件实现仍通过 Files 公共入口执行。
export function makeTransferOptions(createId: () => string) {
  return <T extends object>(
    options: T,
  ): T & Pick<OssTransferOptions, 'getTransferDirectory' | 'createId'> => ({
    getTransferDirectory: () => {
      const { getNativeTemporaryRoot } = jest.requireActual(
        '@unif/react-native-files',
      );
      const root = getNativeTemporaryRoot();
      return root ? `${root}/PortalOssTransfers` : undefined;
    },
    createId,
    ...options,
  });
}
