import Image from "next/image";

type LoadingScreenProps = {
  label?: string;
  fullscreen?: boolean;
};

export default function LoadingScreen({
  label = "Memuat...",
  fullscreen = true,
}: LoadingScreenProps) {
  const Container = fullscreen ? "div" : "div";

  return (
    <Container
      className={
        (fullscreen
          ? "fixed inset-0 z-50 "
          : "") +
        "flex items-center justify-center bg-gray-100/90"
      }
    >
      <div className="flex flex-col items-center gap-3">
        {/* Wrapper logo + ring */}
        <div className="relative w-24 h-24 flex items-center justify-center">
          {/* Cincin animasi */}
          <div className="absolute inset-0 rounded-full border-4 border-gray-200 border-t-blue-500 animate-spin" />

          {/* Logo di tengah */}
          <div className="w-16 h-16 rounded-full bg-white shadow flex items-center justify-center overflow-hidden">
            <Image
              src="/logo-waroeng-foto.png"
              alt="Waroeng Foto"
              width={64}
              height={64}
              className="object-contain"
              priority
            />
          </div>
        </div>

        {label && (
          <p className="text-sm text-gray-700 font-medium">
            {label}
          </p>
        )}
      </div>
    </Container>
  );
}
