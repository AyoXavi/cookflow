"use client"

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { redirect } from "next/navigation";
import { useCallback } from "react";

export default function Home() {
  const session = authClient.useSession()

  const signIn = useCallback(async () => {
    if (session.isPending) {
      return
    }

    if (!session.data) {
      return authClient.signIn.social({ provider: "google", callbackURL: "/app" })
    }

    redirect("/app")
  }, [session])

  return (
    <div className="font-sans grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20">
      <main className="flex flex-col gap-[32px] row-start-2 items-center justify-center">
        <h1 className="text-7xl font-bold">🧑‍🍳 CookFlow</h1>
        <div className="text-2xl">
          Your personal AI-powered cooking assistant.
        </div>
        <Button onClick={signIn} size="lg" disabled={session.isPending}>
          {
            session.isPending
              ?
              <div className="flex items-center justify-center gap-1">
                <Spinner />
                Waiting...
              </div>
              :
              session.data
                ?
                "Continue"
                :
                "Get Started"
          }
        </Button>
      </main>
      <footer className="row-start-3 flex gap-[24px] flex-wrap items-center justify-center">
      </footer>
    </div>
  );
}
