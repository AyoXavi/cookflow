"use client"

import { useEffect, useState } from "react";
import { Chat } from "./Chat";
import { User } from "@/generated/prisma";
import { AppContext } from "./AppContext";
import { X } from "lucide-react";
import { Button } from "../ui/button";
import { ParsedRecipe } from "@/lib/types";
import { Label } from "../ui/label";
import { Checkbox } from "../ui/checkbox";

export default function App({ user }: { user: User }) {
  const [selectedRecipe, setSelectedRecipe] = useState<ParsedRecipe | null>(null)
  const [materials, setMaterials] = useState<{ name: string, selected: boolean }[]>([])
  const [recipeSteps, setRecipeSteps] = useState<{ name: string, selected: boolean }[]>([])
  const [hasMaterials, setHasMaterials] = useState(false)

  // Reset
  useEffect(() => {
    if (!selectedRecipe) {
      setMaterials([])
      setHasMaterials(false)
    } else {
      setMaterials(selectedRecipe.cooking_materials.map(name => ({ name, selected: false })))
      setRecipeSteps(selectedRecipe.steps.map(name => ({ name, selected: false })))
    }
  }, [selectedRecipe])

  // Mark all materials obtained
  useEffect(() => {
    if (!selectedRecipe) return
    if (!materials.length) return

    if (materials.every(mat => mat.selected)) {
      setHasMaterials(true)
    }
  }, [materials, selectedRecipe])

  // Mark recipe and meal finished
  useEffect(() => {
    if (!selectedRecipe) return
    if (!recipeSteps.length) return

    if (recipeSteps.every(step => step.selected)) {
      setSelectedRecipe(null)
    }
  }, [selectedRecipe, recipeSteps])

  return (
    <AppContext value={({ selectedRecipe, setSelectedRecipe })}>
      <div className="flex h-screen w-screen flex-col md:flex-row">
        {
          selectedRecipe &&
          <div className="w-full flex-1/12 flex flex-col p-2 px-4 gap-2">
            <div className="flex justify-end w-full">
              <Button variant="outline" className="w-fit" onClick={() => setSelectedRecipe(null)}>
                <X />
              </Button>
            </div>
            {
              hasMaterials ?
                <CheckList
                  tasks={recipeSteps}
                  onTaskCompleted={(index) => {
                    setRecipeSteps(prev =>
                      prev.map((t, i) => (i === index ? { ...t, selected: !t.selected } : t))
                    )
                  }}
                /> :
                <CheckList
                  tasks={materials}
                  onTaskCompleted={(index) => {
                    setMaterials(prev =>
                      prev.map((t, i) => (i === index ? { ...t, selected: !t.selected } : t))
                    )
                  }}
                />
            }
          </div>
        }
        <Chat
          user={user}
          initialMessage={`Hi, ${user.name}! What would you like to prepare today?`}
          api="/api/generate-recipe"
        />
      </div>
    </AppContext>
  )
}

function CheckList({
  tasks,
  onTaskCompleted
}: {
  tasks: { name: string, selected: boolean }[],
  onTaskCompleted: (index: number) => void,
}) {
  return (
    <div className="flex flex-col gap-1">
      {tasks.map((task, index) => (
        <Label
          className="w-full hover:bg-accent/50 flex items-start gap-3 rounded-lg border p-3 has-[[aria-checked=true]]:border-blue-600 has-[[aria-checked=true]]:bg-blue-50 dark:has-[[aria-checked=true]]:border-blue-900 dark:has-[[aria-checked=true]]:bg-blue-950"
          key={index}
        >
          <Checkbox checked={task.selected} onCheckedChange={() => onTaskCompleted(index)} />
          {task.name}
        </Label>
      ))}
    </div>
  )
}