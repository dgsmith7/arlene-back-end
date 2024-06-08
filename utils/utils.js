import dotenv from "dotenv";
dotenv.config();
import OpenAI from "openai";
const openai = new OpenAI();
import { questions } from "./questions.js";

export async function buildThread(infoArray) {
  console.log("Passed info:");
  console.log(infoArray);
  console.log("Building thread content...");
  let threadContent = [];
  threadContent.push({
    role: "user",
    content:
      "You are a helpful assistant that will produce a maintenance plan based on the following information. ",
  });
  // const openMessage = await openai.beta.threads.messages.create(thread.id, {
  //   role: "assistant",
  //   content:
  //     "You are a helpful assistant that will produce a report based on the following conversation. ",
  // });
  //  console.log(openMessage);

  await infoArray.forEach(async (item, index) => {
    if (threadContent.length <= 30) {
      let reply = questions.filter(
        (question) => question.title == item.title
      )[0].val;
      if (item.val != "otherSeeText") {
        threadContent.push({
          role: "user",
          content: reply + ": " + item.val.toString(),
        });
      }
    }
  });
  console.log("Initializing thread...");
  const thread = await openai.beta.threads.create({
    messages: threadContent,
  });
  console.log(thread.id);
  console.log(threadContent);
  return thread.id;
}

export async function runThread(id) {
  let run = await openai.beta.threads.runs.createAndPoll(id, {
    assistant_id: process.env.ASST_KEY,
    instructions:
      "Please address the user respectfully. The user has a premium account.",
  });

  if (run.status === "completed") {
    console.log(run);
    let report = "";
    const messages = await openai.beta.threads.messages.list(run.thread_id);
    for (const message of messages.data.reverse()) {
      if (message.role == "assistant") {
        console.log(`${message.role} > ${message.content[0].text.value}`);
        report += `${message.content[0].text.value}`;
      }
    }
    return report;
  } else {
    console.log(run.status);
  }

  // const run = openai.beta.threads.runs
  //   .stream(id, {
  //     assistant_id: process.env.ASST_KEY,
  //   })
  //   .on("textCreated", (text) => console.log("\nassistant > "))
  //   .on("textDelta", (textDelta, snapshot) => console.log(textDelta.value))
  //   .on("toolCallCreated", (toolCall) =>
  //     console.log(`\nassistant > ${toolCall.type}\n\n`)
  //   )
  //   .on("toolCallDelta", (toolCallDelta, snapshot) => {
  //     if (toolCallDelta.type === "code_interpreter") {
  //       if (toolCallDelta.code_interpreter.input) {
  //         console.log(toolCallDelta.code_interpreter.input);
  //       }
  //       if (toolCallDelta.code_interpreter.outputs) {
  //         console.log("\noutput >\n");
  //         toolCallDelta.code_interpreter.outputs.forEach((output) => {
  //           if (output.type === "logs") {
  //             console.log(`\n${output.logs}\n`);
  //           }
  //         });
  //       }
  //     }
  //   });
}
