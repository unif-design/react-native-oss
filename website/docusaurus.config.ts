import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Unif OSS',
  tagline: 'React Native OSS 文件上传、远程转存与顺序批量',
  url: 'https://unif-design.github.io',
  baseUrl: '/react-native-oss/',
  organizationName: 'unif-design',
  projectName: 'react-native-oss',
  trailingSlash: false,
  onBrokenLinks: 'throw',
  markdown: { hooks: { onBrokenMarkdownLinks: 'throw' } },
  i18n: { defaultLocale: 'zh-Hans', locales: ['zh-Hans'] },
  presets: [
    [
      'classic',
      {
        docs: { path: '../docs', sidebarPath: './sidebars.ts' },
        blog: false,
        theme: { customCss: './src/css/custom.css' },
      } satisfies Preset.Options,
    ],
  ],
  themeConfig: {
    colorMode: { defaultMode: 'light', respectPrefersColorScheme: true },
    navbar: {
      title: 'Unif OSS',
      items: [
        { to: '/docs/api', label: 'API', position: 'left' },
        { to: '/docs/native-setup', label: '原生接线', position: 'left' },
        {
          href: 'https://github.com/unif-design/react-native-oss',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'light',
      links: [
        {
          title: '使用指南',
          items: [
            { label: '行为契约', to: '/docs/contract' },
            { label: '研发验证', to: '/docs/development' },
          ],
        },
        {
          title: '资源',
          items: [
            {
              label: 'npm',
              href: 'https://www.npmjs.com/package/@unif/react-native-oss',
            },
            { label: 'LLM 文档', href: 'pathname:///llms.txt' },
          ],
        },
        {
          title: 'Unif 生态',
          items: [
            {
              label: 'Files',
              href: 'https://unif-design.github.io/react-native-files/',
            },
            {
              label: 'Logger',
              href: 'https://unif-design.github.io/react-native-logger/',
            },
          ],
        },
      ],
      copyright: '@unif/react-native-oss · MIT',
    },
  } satisfies Preset.ThemeConfig,
};
export default config;
