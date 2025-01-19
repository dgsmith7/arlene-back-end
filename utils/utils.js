import nodemailer from "nodemailer";
//import jwt from "jsonwebtoken";
import { logger } from "../index.js";
import dotenv from "dotenv";
dotenv.config();
import OpenAI from "openai";
const openai = new OpenAI();
import { questions } from "./questions.js";
import { Account } from "../models/accountDataModel.js";

export async function buildThread(infoArray) {
  // console.log("Passed info:");
  // console.log(infoArray);
  // console.log("Building thread content...");
  let threadContent = [];
  threadContent.push({
    role: "user",
    content:
      "You are a helpful assistant that will produce a maintenance plan based on the following information. ",
  });

  await infoArray.forEach(async (item, index) => {
    if (threadContent.length <= 30) {
      threadContent.push({
        role: "user",
        content: item.title + ": " + item.val,
      });
      console.log({
        role: "user",
        content: item.title + ": " + item.val,
      });
      //}
    }
  });
  //  console.log("Initializing thread...");
  const thread = await openai.beta.threads.create({
    messages: threadContent,
  });
  //  console.log(thread.id);
  return thread.id;
}

export async function runThread(id, content) {
  const message = await openai.beta.threads.messages.create(id, {
    role: "user",
    content: content,
  });
  let report = "";
  const stream = await openai.beta.threads.runs.create(id, {
    assistant_id: process.env.ASST_KEY,
    stream: true,
  });
  for await (const event of stream) {
    if (event.event == "thread.message.completed") {
      //      console.log("event - ", event);
      report = event.data.content[0];
      //      console.log(report);
    }
  }
  //  console.log("util report: ", report);
  return report;
}

export async function RetrieveAndUpdateThread(accountData) {
  let report = "";
  if (accountData.needsUpdate == "true") {
    report = await updateWithNewOrgData(accountData);
  } else {
    report = "No update needed.";
  }
  const myThread = await openai.beta.threads.retrieve(accountData.threadId);
  const threadMessages = await openai.beta.threads.messages.list(
    accountData.threadId
  );
  let messageArr = [];
  let raw = threadMessages.data;
  raw.forEach((item, index) => {
    messageArr.push({
      isUser: item.role == "user",
      text: item.content[0].text.value,
    });
  });
  return { text: report, messages: messageArr };
}

async function updateWithNewOrgData(accountData) {
  let updates =
    "I have updated the data about my organization. Here is all of the new info in the form of a Q+A:";
  questions.forEach(async (item, index) => {
    updates += item.val;
    updates += accountData[item.title] + ".";
  });
  const message = await openai.beta.threads.messages.create(
    accountData.threadId,
    {
      role: "user",
      content: updates,
    }
  );
  let stream = await openai.beta.threads.runs.create(accountData.threadId, {
    assistant_id: process.env.ASST_KEY,
    stream: true,
  });
  for await (const event of stream) {
    if (event == "done") {
      //      console.log("event - ", event);
    } else {
      //      process.stdout.write(".");
    }
  }
  // const messages = await openai.beta.threads.messages.list(
  //   accountData.threadId
  // );
  // let report = "";
  // report = messages.data[0].content[0].text.value;
  // console.log(report);
  return "Updated thread with new data.";
}

class BaconRand {
  // seedable prng
  constructor(_tokenData) {
    this.hashVal = parseInt(_tokenData, 16); // seed
  }
  rand() {
    // a prng for the seed of this instance in the class
    // mulberry32 from https://github.com/bryc/code/blob/master/jshash/PRNGs.md
    let t = (this.hashVal += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

function prepareHash(hash) {
  // sanitize hash seed for seedable prng
  let newHash = "";
  for (let i = 0; i < hash.length; i++) {
    newHash += hash.charCodeAt(i);
  }
  newHash = newHash.replace(/\D/g, "");
  return newHash.substring(0, 16);
}

export async function nDigitOTP(n, hash) {
  // produce a code from hash of length n
  hash = prepareHash(hash);
  let rando = new BaconRand(hash);
  let pool = "0123456789abcdefghijklmnopqrstuvwxyx";
  let OTP = "";
  for (let i = 0; i < n; i++) {
    let num = parseInt(rando.rand() * pool.length);
    OTP += pool.charAt(num);
  }
  rando = null;
  return OTP;
}

let transporter = nodemailer.createTransport({
  host: process.env.GMAIL_HOST,
  port: process.env.MAIL_PORT,
  secure: process.env.MAIL_SECURE,
  auth: {
    user: process.env.GMAIL_USERNAME,
    pass: process.env.GMAIL_PASSWORD,
  },
  requireTLS: process.env.MAIL_TLS,
});

export async function sendMessage(sub, txt) {
  let message = {
    from: process.env.MESSAGE_FROM,
    to: process.env.MESSAGE_TO,
    subject: sub,
    text: txt,
  };

  await transporter
    .sendMail(message)
    .then(() => {
      logger.log({ level: "info", message: "Message sent" });
    })
    .catch((err) => {
      logger.log({ level: "info", message: "Message not sent - " + err });
    });
}

export async function send2fa(code, address) {
  let message = {
    from: process.env.MESSAGE_FROM,
    to: address,
    subject: `One time code`,
    text: `Your code is: ${code}`,
  };

  await transporter
    .sendMail(message)
    .then(() => {
      logger.log({ level: "info", message: "Message sent" });
    })
    .catch((err) => {
      logger.log({ level: "info", message: "Message not sent - " + err });
    });
}

export async function sendPasswordResetLink(user) {
  //  send jwt with link for password reset
  // Generate a unique JWT token for the user that contains the user's id
  const token = jwt.sign({ userId: user._id }, process.env.SECRET_KEY, {
    expiresIn: "5m",
  });
  // Email configuration
  const message = {
    from: process.env.MESSAGE_FROM,
    to: user.email,
    subject: "Reset Password",
    html: `<h1>Reset Your Password</h1>
    <p>Click on the following link to reset your password:</p>
    <a href="http://localhost:5173/reset/${token}">http://localhost:5173/reset/${token}</a>
    <p>The link will expire in <b><em>5 minutes.</em></b></p>
    <p>If you didn't request a password reset, please ignore this email.</p>`,
  };
  // Send the email
  await transporter
    .sendMail(message)
    .then(() => {
      logger.log({ level: "info", message: "Message sent" });
    })
    .catch((err) => {
      logger.log({ level: "info", message: "Message not sent - " + err });
    });
}

export async function generateCSRFToken(value) {
  // build a csrf token
  let hash = value.toString() + process.env.SECRET_CSRF_KEY.toString();
  let it = await nDigitOTP(32, hash);
  return it;
}

export async function setUpNewUser(username) {
  //  console.log("Setting up new user in db.");
  // do db stuff
  const newId = await getNewThreadId();
  const account = new Account({
    username: username,
    firstName: " ",
    lastName: " ",
    avatarChoice: "unnamed",
    threadId: newId,
    plan: "Free plan",
    expires: "20300704",
    organizationName: " ",
    organizationPrimaryObj: " ",
    organizationSecondaryObj: " ",
    organizationConstraints: " ",
    organizationCompliance: " ",
    organizationOperationalConst: " ",
    organizationQtySystems: " ",
    organizationTypeSystem: " ",
    organizationMTBF: " ",
    organizationHoursPerMonth: " ",
    organizationIntervals: " ",
    organizationDepotTurnAround: " ",
    organizationRecentChanges: " ",
    organizationHistorical: " ",
    organizationTypeOptimization: " ",
    organizationScenarios: " ",
    organizationOptimPrefs: " ",
    organizationSpecialConsideration: " ",
    organizationRealtimeData: " ",
    organizationStakeholders: " ",
    organizationFormat: " ",
    organizationTimeframe: " ",
    organizationMetrics: " ",
    organizationDescription: " ",
    organizationPrimaries: " ",
    organizationAdditionalComments: " ",
    scopeNeedsUpdate: false,
  });
  account.save().then(() => {
    //   console.log("saved");
  });
}

export async function getNewThreadId() {
  let thread = await openai.beta.threads.create();
  return thread.id;
}
