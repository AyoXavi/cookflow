import path from "path"
import { readFileSync } from "fs"
import { createAzure } from "@ai-sdk/azure"

const azure_gpt4 = createAzure({
    baseURL: process.env.AZURE_DEPLOYMENT_BASEURL,
    apiVersion: process.env.AZURE_GPT4_DEPLOYMENT_APIVER,
    useDeploymentBasedUrls: true,
})

export const baseConfig = {
    model: azure_gpt4(process.env.AZURE_GPT4_DEPLOYMENT_NAME!),
}

export function readPrompt(promptName: string) {
    const promptPath = path.join(process.cwd(), "./src/lib/prompts", promptName + ".md")
    const promptContent = readFileSync(promptPath).toString()

    // Match everything between the first and second line of contiguous equal signs (including newlines)
    const match = promptContent.match(/={2,}([^=]+)={2,}/g)
    console.log(match![0])
    return match![0]
}