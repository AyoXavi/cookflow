import App from "@/components/features/App";
import { Chat } from "@/components/features/Chat";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
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