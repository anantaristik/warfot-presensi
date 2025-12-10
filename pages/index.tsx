import { useEffect } from "react";
import { useRouter } from "next/router";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../lib/firebase";
import { doc, getDoc } from "firebase/firestore";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      // Ambil role user
      const ref = doc(db, "users", user.uid);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        router.replace("/login");
        return;
      }

      const data = snap.data();

      // Redirect sesuai role
      if (data.role === "admin") {
        router.replace("/dashboard");
      } else {
        router.replace("/presensi");
      }
    });

    return () => unsub();
  }, [router]);

  return null;
}
