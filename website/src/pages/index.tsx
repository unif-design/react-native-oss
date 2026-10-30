import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import '@unif/react-native-design/docs-home.css';

export default function Home() {
  return (
    <Layout
      title="OSS 上传与转存"
      description="React Native 临时凭证、PostObject 上传、远程转存与顺序批量。"
    >
      <main className="container unif-home oss-home">
        <p className="oss-eyebrow">UNIF · REACT NATIVE</p>
        <h1>
          上传本地文件，
          <br />
          转存远程资源。
        </h1>
        <p className="oss-lead">
          使用临时 STS
          上传文件，支持远程转存与顺序批量，分别交付上传结果和源文件读取结束通知。
        </p>
        <div className="oss-actions">
          <Link className="button button--primary button--lg" to="/docs/api">
            查看 API
          </Link>
          <Link
            className="button button--secondary button--lg"
            to="/docs/native-setup"
          >
            接入原生宿主
          </Link>
        </div>
        <section className="oss-grid" aria-label="核心能力">
          <article>
            <h2>临时授权</h2>
            <p>
              验证 STS、限定 key 范围，按实例缓存；身份变化时由应用释放实例。
            </p>
          </article>
          <article>
            <h2>明确回执</h2>
            <p>区分成功、拒绝、取消与未确认结果，顺序保留每一项上传结果。</p>
          </article>
          <article>
            <h2>文件交接</h2>
            <p>
              通知调用方何时可释放源文件；远程转存只清理自身创建的临时文件。
            </p>
          </article>
        </section>
        <h2>从真实原生 example 开始</h2>
        <p>
          iOS / Android 工程随仓库维护，SDK 补丁由宿主统一准备。Web
          展示接入文档，原生能力通过开发构建运行。
        </p>
        <Link to="/docs/development">查看开发与分层验证 →</Link>
      </main>
    </Layout>
  );
}
