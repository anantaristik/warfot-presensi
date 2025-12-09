import Head from "next/head";
import type { AppProps } from "next/app";
import "../styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>Warfot Presensi</title>
        <meta name="description" content="Aplikasi Presensi Karyawan Waroeng Foto" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
