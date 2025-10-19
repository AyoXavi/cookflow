export type ParsedRecipe = {
    "isRecipe": boolean,
    "title": string | null,
    "ingredients": { "name": string, "quantity": string | null }[],
    "steps": string[],
    "servings": string | null,
    "cooking_materials": string[],
}