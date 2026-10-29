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
          上传有回执，
          <br />
          文件有归属。
        </h1>
        <p className="oss-lead">
          以临时凭证上传本地文件，转存远程资源，在取消和并发中保持清晰的授权与释放边界。
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
            <p>验证 STS、限定 key 范围，按授权实例缓存，随身份失效。</p>
          </article>
          <article>
            <h2>明确回执</h2>
            <p>区分成功、拒绝、取消与未确认结果，顺序保留每一项上传结果。</p>
          </article>
          <article>
            <h2>文件交接</h2>
            <p>原生停止读取后释放源文件，远程转存清理自己拥有的临时产物。</p>
          </article>
        </section>
        <h2>从真实原生 example 开始</h2>
        <p>
          iOS / Android 工程与 SDK 补丁随仓库维护。Web
          展示接入文档，原生能力通过开发构建运行。
        </p>
        <Link to="/docs/development">查看开发与分层验证 →</Link>
      </main>
    </Layout>
  );
}
