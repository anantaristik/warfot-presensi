import { useState } from "react";
import { useRouter } from "next/router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // ✅ Login ke Firebase Auth
      const cred = await signInWithEmailAndPassword(auth, email, password);

      const uid = cred.user.uid;

      // ✅ Ambil data user dari Firestore
      const userRef = doc(db, "users", uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        throw new Error("Data user tidak ditemukan di Firestore");
      }

      const userData = userSnap.data();

      // ✅ Redirect berdasarkan role
      if (userData.role === "admin") {
        router.push("/dashboard");
      } else {
        router.push("/presensi");
      }
    } catch (err: any) {
      console.error("LOGIN ERROR:", err);
      setError("Email / password salah atau role belum terdaftar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen text-black flex items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-md bg-white shadow-md rounded-lg p-6">
  
            {/* ✅ LOGO */}
            <div className="flex justify-center mb-4">
                <Image
                src="/logo-waroeng-foto.png"
                alt="Waroeng Foto"
                width={120}
                height={120}
                className="object-contain"
                priority
                />
            </div>

            {/* ✅ TITLE */}
            <h1 className="text-2xl font-bold mb-4 text-center text-black">
                Login Presensi Waroeng Foto
            </h1>


        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              className="w-full rounded border px-3 py-2 text-sm outline-none focus:ring focus:ring-blue-200"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="password"
              className="w-full rounded border px-3 py-2 text-sm outline-none focus:ring focus:ring-blue-200"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 font-medium">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded font-semibold text-sm hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Masuk..." : "Masuk"}
          </button>
        </form>
      </div>
    </div>
  );
}
