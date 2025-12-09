import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="id">
      <Head>
        {/* ✅ TITLE GLOBAL */}
        <title>Warfot Presensi</title>

        {/* ✅ META BASIC */}
        <meta name="description" content="Aplikasi Presensi Karyawan Warfot" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />

        {/* ✅ FAVICON (sementara default dulu) */}
        <link rel="icon" href="/favicon.ico" />

        {/* ✅ THEME COLOR (ANDROID) */}
        <meta name="theme-color" content="#16a34a" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
