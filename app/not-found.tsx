// Root-level 404 for requests outside the [locale] tree. The root layout
// passes children through without <html>/<body>, so this page must render
// the full document itself to stay valid HTML.
export default function RootNotFound() {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif' }}>
        <div
          style={{
            minHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0d1830',
            color: '#fff',
            textAlign: 'center',
            padding: '0 16px',
          }}
        >
          <p style={{ fontSize: 72, fontWeight: 800, color: 'rgba(255,255,255,0.2)', margin: 0 }}>404</p>
          <h1 style={{ fontSize: 24, margin: '16px 0 8px' }}>Page not found · Không tìm thấy trang</h1>
          <a
            href="/"
            style={{
              marginTop: 24,
              display: 'inline-flex',
              alignItems: 'center',
              height: 48,
              padding: '0 24px',
              borderRadius: 9999,
              background: '#fff',
              color: '#16243d',
              fontWeight: 600,
              fontSize: 14,
              textDecoration: 'none',
            }}
          >
            Go home · Về trang chủ
          </a>
        </div>
      </body>
    </html>
  )
}
