import App from "@/components/features/App";
import { User } from "@/generated/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function AppPage() {
  const session = await auth.api.getSession({
    headers: await headers()
  })

  if (!session) {
    redirect("/")
  }

  return (
    <div className="w-screen h-screen">
      <App
        user={session.user as User}
      />
    </div>
  )
}