import { ParsedRecipe } from "@/lib/types"
import { createContext } from "react"

export const AppContext = createContext<{
  selectedRecipe: ParsedRecipe | null,
  setSelectedRecipe: (recipe: ParsedRecipe | null) => void
} | null>(null)
