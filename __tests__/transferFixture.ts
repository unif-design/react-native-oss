import type { OssTransferOptions } from '@unif/react-native-oss';

// 宿主注入原目录策略与唯一文件名；实际文件实现仍通过 Files 公共入口执行。
export function makeTransferOptions(createId: () => string) {
  return <T extends object>(
    options: T,
  ): T & Pick<OssTransferOptions, 'transferDirectory' | 'createId'> => {
    const { getNativeTemporaryRoot } = jest.requireActual(
      '@unif/react-native-files',
    );
    const root = getNativeTemporaryRoot();
    return {
      transferDirectory: root ? `${root}/PortalOssTransfers` : undefined,
      createId,
      ...options,
    };
  };
}
