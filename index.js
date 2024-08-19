import express from "express";
import passport from "passport";
import session from "express-session";
import LocalStrategy from "passport-local";
import { User } from "./models/userModel.js";
import { Account } from "./models/accountDataModel.js";
import MongoStore from "connect-mongo";
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();
import cors from "cors";
import * as utils from "./utils/utils.js";
import jwt from "jsonwebtoken";
import winston from "winston";
import "winston-mongodb";
import { body, validationResult } from "express-validator";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";

const port = `${process.env.PORT}`;

/*
  MongoDB
*/
const dbName = process.env.DO_DB_NAME;
const mongoString = `${process.env.DO_URI_HEAD}${process.env.DO_DB_NAME}${process.env.DO_URI_TAIL}`;
await mongoose.connect(mongoString);
const db = mongoose.connection;

const app = express();
console.log("We are in " + app.get("env") + " mode.");

/*
  General use
*/
app.use(express.json());
app.use(express.text());
app.use(express.urlencoded({ extended: true }));

/*
  Loggers
*/
export const logger = winston.createLogger({
  level: "info",
  transports: [
    // write errors to console too
    new winston.transports.Console({
      format: winston.format.simple(),
      level: "info",
    }),
    new winston.transports.MongoDB({
      db: await Promise.resolve(db),
      collection: "auth-log",
      format: winston.format.json(),
      level: "info",
    }),
  ],
});
const originLogger = function (req, res, next) {
  logger.log({
    level: "info",
    message: `origin: ${req.headers.origin}, referrer: ${req.headers.referer}, request: ${req.method} ${req.url}`,
  });
  next();
};
app.use(originLogger);

/*
  Limiter for dDOS attack mitigation
*/
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes).
  standardHeaders: "draft-7", // draft-6: `RateLimit-*` headers; draft-7: combined `RateLimit` header
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
  // store: ... , // Redis, Memcached, etc. See below.
});
app.use(limiter);

/* 
  CORS
*/
const corsOptionsDev = {
  credentials: true,
  origin: "http://localhost:5173",
  methods: ["POST", "GET"],
};
const corsOptionsProd = {
  credentials: true,
  allowedHeaders: ["Accept", "Content-Type"],
  origin: "https://aviation-readiness-app-sdbks.ondigitalocean.app",
  methods: ["POST", "GET", "OPTIONS"],
};
// app.use(
//   cors(corsOptionsProd)
//   //  cors(app.get("env") === "production" ? corsOptionsProd : corsOptionsDev)
// );
// app.use(
//   cors({
//     credentials: true,
//     allowedHeaders: ["Accept", "Content-Type"],
//     origin: "https://aviation-readiness-app-sdbks.ondigitalocean.app",
//     //    methods: ["POST", "GET"],
//   })
// );
app.use(cors());
/*
  Session configuration and utilization of the MongoStore for storing
  the session in the MongoDB database
*/
const sessOptions = {
  httpOnly: true, // set as default - maybe need the remove is not viewable
  secret: process.env.SECRET_KEY,
  resave: false,
  saveUninitialized: true,
  store: new MongoStore({ mongoUrl: db.client.s.url }),
  maxAge: 7200000, //2 hours
  cookie: { secure: true, sameSite: "none" },
};
// if (app.get("env") === "production") {
//   app.set("trust proxy", 1); // trust first proxy
//   sessOptions.cookie.secure = true; // serve secure cookies
// }
app.set("trust proxy", 1);
//sessOptions.cookie.secure = true; // serve secure cookies
app.use(session(sessOptions));

/*
  Passport items - see http://www.passportjs.org/concepts/authentication/
*/
const strategy = new LocalStrategy(User.authenticate());
passport.use(strategy);
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());
app.use(passport.initialize());
app.use(passport.session());

/*
  Helmet for headers and attack mitigation
*/
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "default-src": ["'self'"],
        "base-uri": ["'self'"],
        "font-src": ["'self'"],
        "form-action": ["'self'"],
        "frame-ancestors": ["'self'"],
        "img-src": ["'self'"],
        "object-src": ["'none'"],
        "script-src": ["'self'"],
        "script-src-attr": ["'none'"],
        "style-src": ["'self'"],
      },
      //reportOnly: true;
    },
  })
);

/*
  Register a new user
*/
app.post(
  "/register",
  [
    body("email").isEmail().withMessage("Invalid email address"),
    body("username")
      .isLength({ min: 6 })
      .withMessage("Username must be at least 6 characters long"),
    body("password")
      .isLength({ min: 10, max: 32 })
      .withMessage("Password must be at least 10-32 characters long"),
  ],
  function async(req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      //      console.log(...errors);
      return res
        .status(400)
        .json({ message: errors.array(0), err: errors.array() });
    }
    User.register(
      new User({
        email: req.body.email,
        username: req.body.username,
        privileges: "Basic", //"Admin",
        twoFAVerified: false,
        status: "Active",
      }),
      req.body.password,
      async function (err, msg) {
        if (err) {
          if (err.code == "11000") {
            logger.log({
              level: "error",
              message: `${req.body.username} at ${req.body.email} attempted to register with duplicate address or username`,
            });
            res.status(401).send({
              name: "Duplicate key",
              message:
                "An account using that email address or username already exists.",
            });
          } else {
            logger.log({
              level: "error",
              message: `Error during register for ${req.body.username} at ${req.body.email}: ${err}`,
            });
            res.status(500).send({ message: "fail", err: err.message });
          }
        } else {
          await utils.setUpNewUser(req.body.username);
          req.session.firstVisit = true;
          logger.log({
            level: "info",
            message: `${req.body.username} at ${req.body.email} successfully registered.`,
          });
          res.send({
            message: "Successfully registered.",
            priv: msg.privileges,
          });
        }
      }
    );
  }
);

/*
  Login and logout routes 
*/
app.post(
  "/login",
  [
    body("username").notEmpty().withMessage("Username is required"),
    body("password").notEmpty().withMessage("Password is required"),
  ],

  passport.authenticate("local", {
    failureRedirect: "/login-failure",
    successRedirect: "/login-success",
  }),
  (req, res, err, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    res.status(500).send({ message: "fail", err: err.message });
  }
);

app.get("/login-failure", (req, res, next) => {
  console.log("failure:", req);
  logger.log({
    level: "error",
    message: `FAILED LOGIN by ${req.username}`,
  });
  res.status(401).send({ message: "fail", privileges: "unauth" });
});

app.get("/login-success", async (req, res, next) => {
  console.log("success:", req);
  logger.log({
    level: "info",
    message: `Successful 1FA login for ${req.user.username} with ${req.user.privileges}.`,
  });
  res.status(200).send({
    message: "Login successful",
    privileges: req.user.privileges,
  });
});

app.post("/logout", (req, res, next) => {
  //  req.session.csrfToken = null;
  req.logout(function (err) {
    if (err) {
      logger.log({
        level: "error",
        message: `Failed logout.`,
      });
      res.status(500).send({ message: "fail", err: err.message });
    }
    logger.log({
      level: "info",
      message: `Successful logout.`,
    });
    res.status(200).send({ message: "Logout successful" });
  });
});

/*
  2FA functions 
*/
app.post("/mail2fa", async (req, res) => {
  let code = "";
  code = await utils.nDigitOTP(6, req.session.id);
  req.session.tfa = code;
  const user = await User.findOne({ username: req.session.passport.user });
  await utils
    .send2fa(code, user.email)
    .then(() => {
      logger.log({
        level: "info",
        message: `2FA mail sent for ${user.username}.`,
      });
      res.status(200).send({ message: "success" });
    })
    .catch(() => {
      logger.log({
        level: "error",
        message: `2FA mail send failed for ${req.session.passport.user}.`,
      });
      res.status(500).send({ message: "fail", err: err.message });
    });
});

app.post("/verify2fa", async (req, res) => {
  let code = req.session.tfa;
  req.session.tfa = null;
  let enteredCode = req.body.tfa;
  let check = await utils.nDigitOTP(6, req.session.id);
  if (code == enteredCode && enteredCode == check) {
    logger.log({
      level: "info",
      message: `2FA verified for ${req.user.username}.`,
    });
    User.twoFAVerified = true;
    res.status(200).send({
      message: "success",
      check: User.twoFAVerified,
    });
  } else {
    logger.log({
      level: "error",
      message: `2FA not verified for ${req.user.username}.`,
    });
    res.status(500).send({ message: "fail", err: err.message });
  }
});

/*
  Forgot password / reset password functions 
*/
app.post(
  "/forgot",
  [body("email").isEmail().withMessage("Invalid email address")],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    req.session.otp = await utils.nDigitOTP(16, req.session.id);
    try {
      const forgetter = await User.findOne({
        email: { $eq: req.body.email.toString() },
      });
      if (!forgetter) {
        //  Return success but dont send email (spoof attackers)
        logger.log({
          level: "error",
          message: `Someone attempted to lookup ${req.body.email} - not in db`,
        });
        res.status(200).send({ message: "success" });
      } else {
        await utils
          .sendPasswordResetLink(forgetter)
          .then(() => {
            logger.log({
              level: "info",
              message: `Password reset mail sent for ${forgetter.username}.`,
            });
            res.status(200).send({ message: "success" });
          })
          .catch((err) => {
            logger.log({
              level: "error",
              message: `Password reset mail send failure for ${forgetter.username}: ${err}.`,
            });
            res.status(500).send({ message: "fail", err: err.message });
          });
      }
    } catch (err) {
      logger.log({
        level: "error",
        message: `Password reset mail send failure for ${req.body.username}: ${err}.`,
      });
      res.status(500).send({ message: "fail", err: err.message });
    }
  }
);

app.post(
  "/reset-password/:token",
  [
    body("password")
      .isLength({ min: 10, max: 32 })
      .withMessage("Password must be at 10-32 characters long"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    let newPassword = req.body.password.toString();
    let check = await utils.nDigitOTP(16, req.session.id);
    if (check == req.session.otp) {
      req.session.otp = null;
      try {
        // Verify the token sent by the user
        const decodedToken = jwt.verify(
          req.params.token,
          process.env.SECRET_KEY
        );
        // find the user with the id from the token
        const user = await User.findOne({ _id: { $eq: decodedToken.userId } });
        if (!user) {
          logger.log({
            level: "error",
            message: `Password reset failure for. No user in DB.`,
          });
          res.status(401).send({ message: "no user found" });
        }
        user.setPassword(newPassword, function () {
          user.save();
          // Send success response
          logger.log({
            level: "info",
            message: `Password updated for ${user.username}.`,
          });
          res.status(200).send({ message: "Password updated" });
        });
        // }
      } catch (err) {
        // Send error response if any error occurs
        logger.log({
          level: "error",
          message: `Password reset failure: ${err}.`,
        });
        res.status(500).send({ message: "fail", err: err.message });
      }
    } else {
      req.session.otp = null;
      logger.log({
        level: "error",
        message: `Password reset failure for. OTP mismatch.`,
      });
      res.status(401).send({ message: "no user found" });
    }
  }
);

app.post("/updateemail", async (req, res, err) => {
  let newEmail = req.body.newAddress;
  let csrfToken = req.headers["x-csrf-token"];
  let check = req.session.csrfToken;
  let check2 = await utils.generateCSRFToken(req.session.id);
  if (csrfToken == check && check == check2) {
    if (req.isAuthenticated()) {
      try {
        const update = `{"email":"${newEmail}"}`;
        await User.findOneAndUpdate(
          {
            username: { $eq: req.session.passport.user },
          },
          {
            $set: JSON.parse(update),
          }
        ).catch((err) => console.log(err));
        logger.log({
          level: "info",
          message: `Email updated by ${req.user.username}.`,
        });
        return res.status(200).json({
          data: "success",
        });
      } catch (err) {
        logger.log({
          level: "error",
          message: `Email update by ${req.user.username} failed : ${err.message}.`,
        });
        res.status(500).send({ message: "fail", err: err.message });
      }
    } else {
      logger.log({
        level: "error",
        message: `Email update failed due to no user.`,
      });
      res.status(400).send({ message: "Authentication failure" });
    }
  } else {
    logger.log({
      level: "error",
      message: `Individual account data update by ${req.user.username} failed due to invalid CSRF Token.`,
    });
    res.status(400).send({ message: "Authentication failure" });
  }
});

/*
  Get account data for a basic privilege requests 
*/
app.post("/getaccountdata", async (req, res, err) => {
  let csrfToken = req.headers["x-csrf-token"];
  let check = req.session.csrfToken;
  let check2 = await utils.generateCSRFToken(req.session.id);
  if (csrfToken == check && check == check2) {
    if (req.isAuthenticated()) {
      try {
        const account = await Account.findOne({
          username: { $eq: req.session.passport.user },
        }).catch((err) => console.log(err));
        logger.log({
          level: "info",
          message: `Individual account data retreived by ${req.user.username}.`,
        });
        return res.status(200).json({
          data: account,
          email: req.user.email,
        });
      } catch (err) {
        logger.log({
          level: "error",
          message: `Account list retreival by ${req.user.username} failed : ${err.message}.`,
        });
        res.status(500).send({ message: "fail", err: err.message });
      }
    } else {
      logger.log({
        level: "error",
        message: `Individual account data retreival failed due to no user.`,
      });
      res.status(400).send({ message: "Authentication failure" });
    }
  } else {
    logger.log({
      level: "error",
      message: `Individual account data retreival by ${req.user.username} failed due to invalid CSRF Token.`,
    });
    res.status(400).send({ message: "Authentication failure" });
  }
});

app.post("/updateaccountdata", async (req, res, err) => {
  let fields = req.body.fields;
  let data = req.body.data;
  let csrfToken = req.headers["x-csrf-token"];
  let check = req.session.csrfToken;
  let check2 = await utils.generateCSRFToken(req.session.id);
  if (csrfToken == check && check == check2) {
    if (req.isAuthenticated()) {
      try {
        let updates = "{";
        fields.forEach((item, index) => {
          updates += `"${item}": "${data[index]}",`;
        });
        updates += `"scopeNeedsUpdate": "true"}`;
        //        console.log("updates: ", updates);
        await Account.findOneAndUpdate(
          {
            username: req.session.passport.user,
          },
          {
            $set: JSON.parse(updates),
          }
        ).catch((err) => console.log(err));
        logger.log({
          level: "info",
          message: `Individual account data updated by ${req.user.username}.`,
        });
        return res.status(200).json({
          data: "success",
        });
      } catch (err) {
        logger.log({
          level: "error",
          message: `Account list update by ${req.user.username} failed : ${err.message}.`,
        });
        res.status(500).send({ message: "fail", err: err.message });
      }
    } else {
      logger.log({
        level: "error",
        message: `Individual account data update failed due to no user.`,
      });
      res.status(400).send({ message: "Authentication failure" });
    }
  } else {
    logger.log({
      level: "error",
      message: `Individual account data update by ${req.user.username} failed due to invalid CSRF Token.`,
    });
    res.status(400).send({ message: "Authentication failure" });
  }
});

app.post("/updateindividualdata", async (req, res, err) => {
  //  console.log(req.body.coll, req.body.field, req.body.data);
  let collection = req.body.coll;
  let field = req.body.field;
  let data = req.body.data;
  let csrfToken = req.headers["x-csrf-token"];
  let check = req.session.csrfToken;
  let check2 = await utils.generateCSRFToken(req.session.id);
  if (csrfToken == check && check == check2) {
    if (req.isAuthenticated()) {
      try {
        let updates = "{";
        // fields.forEach((item, index) => {
        //   updates += `"${item}": "${data[index]}",`;
        //   //          if (fields.length - 1 > index) updates += ",";
        // });
        // updates += `"scopeNeedsUpdate": "true"}`;
        // console.log("updates: ", updates);
        const update = `{"${field}":"${data}"}`;
        if (collection == "account") {
          await Account.findOneAndUpdate(
            {
              username: { $eq: req.session.passport.user },
            },
            {
              $set: JSON.parse(update),
            }
          ).catch((err) => console.log(err));
        } else {
          await User.findOneAndUpdate(
            {
              username: req.session.passport.user,
            },
            {
              $set: JSON.parse(update),
            }
          ).catch((err) => console.log(err));
        }
        logger.log({
          level: "info",
          message: `Individual account data updated by ${req.user.username}.`,
        });
        return res.status(200).json({
          data: "success",
        });
      } catch (err) {
        logger.log({
          level: "error",
          message: `Account list update by ${req.user.username} failed : ${err.message}.`,
        });
        res.status(500).send({ message: "fail", err: err.message });
      }
    } else {
      logger.log({
        level: "error",
        message: `Individual account data update failed due to no user.`,
      });
      res.status(400).send({ message: "Authentication failure" });
    }
  } else {
    logger.log({
      level: "error",
      message: `Individual account data update by ${req.user.username} failed due to invalid CSRF Token.`,
    });
    res.status(400).send({ message: "Authentication failure" });
  }
});

/*
  Get a CSRF token for admin requests 
*/
app.post("/getcsrf", async (req, res, err) => {
  const token = await utils.generateCSRFToken(req.session.id);
  req.session.csrfToken = token;
  try {
    res.status(200).send({ csrfToken: token });
  } catch (err) {
    res.status(500).send({ message: "fail", err: err.message });
  }
});

/*
  Admin roles can get all account info 
*/
app.post("/accountlist", async function (req, res) {
  //  console.log(req.session.id, req.user.username);
  let csrfToken = req.headers["x-csrf-token"];
  let check = req.session.csrfToken;
  let check2 = await utils.generateCSRFToken(req.session.id);
  //  console.log(req.session.id, csrfToken, check, check2);
  if (csrfToken == check && check == check2) {
    req.session.csrfToken = null;
    if (req.isAuthenticated() && req.user.privileges === "Admin") {
      try {
        const accounts = await User.find({});
        logger.log({
          level: "info",
          message: `Account list retreived by ${req.user.username}.`,
        });
        return res.status(200).json({
          count: accounts.length,
          data: accounts,
        });
      } catch (err) {
        logger.log({
          level: "error",
          message: `Account list retreival by ${req.user.username} failed : ${err.message}.`,
        });
        res.status(500).send({ message: "fail", err: err.message });
      }
    }
  } else {
    logger.log({
      level: "error",
      message: `Account list retreival by ${req.user.username} failed due to invalid CSRF Token.`,
    });
    res.status(400).send({ message: "Authentication failure" });
  }
});

app.post("/modifylist", async (req, res) => {
  let username = req.body.username;
  let action = req.body.action;
  //  console.log(username, action, " in progress");
  let csrfToken = req.headers["x-csrf-token"];
  let check = req.session.csrfToken;
  let check2 = await utils.generateCSRFToken(req.session.id);
  // console.log(req.session.id, csrfToken, check, check2);
  if (csrfToken == check && check == check2) {
    req.session.csrfToken = null;
    if (req.isAuthenticated() && req.user.privileges === "Admin") {
      try {
        const subjectUser = await User.findOne({ username: { $eq: username } });
        if (!subjectUser) {
          logger.log({
            level: "error",
            message: `No user in DB.`,
          });
          res.status(401).send({ message: "no user found" });
        } else {
          switch (action) {
            case "activate": {
              await User.updateOne(
                { username: subjectUser.username },
                { $set: { status: "Active" } }
              );
              break;
            }
            case "suspend": {
              await User.updateOne(
                { username: subjectUser.username },
                { $set: { status: "Suspended" } }
              );
              break;
            }
            case "upgrade": {
              await User.updateOne(
                { username: subjectUser.username },
                { $set: { privileges: "Admin" } }
              );
              break;
            }
            case "downgrade": {
              await User.updateOne(
                { username: subjectUser.username },
                { $set: { privileges: "Basic" } }
              );
              break;
            }
          }
          logger.log({
            level: "info",
            message: `Action ${action} on ${username} requested by ${req.user.username} completed.`,
          });

          return res.status(200).send({
            message: "success",
          });
        }
      } catch (err) {
        logger.log({
          level: "error",
          message: `Action ${action} on ${username} requested by ${req.user.username} failed : ${err.message}.`,
        });
        res.status(500).send({ message: "fail", err: err.message });
      }
    }
  } else {
    logger.log({
      level: "error",
      message: `Action ${action} on ${username} requested by failed due to invalid CSRF Token.`,
    });
    res.status(400).send({ message: "Authentication failure" });
  }
});

/*
  Chatbot routes 
*/
app.post("/advise", async function (req, res) {
  if (req.isAuthenticated()) {
    //    console.log("Needs update: ", req.body.needsUpdate);
    try {
      let id = req.body.threadId;
      let content = req.body.problem;
      // console.log("The ID is ", id);
      // console.log("And content: ", content);
      let report = await utils.runThread(id, content);

      //      console.log("report:", typeof report, `\n`, report);
      return res.status(200).json({ text: report });
      //.json({ text: "Here is your magic solution from the AI bot." })
    } catch (error) {
      console.log("This is the error - ", error.message);
      res.status(500).send({ message: error.message });
    }
  } else {
    res.status(500).send({ message: "auth error" });
  }
});

app.post("/makethread", async function (req, res) {
  // make a new thread for use with the assistant
  if (req.isAuthenticated()) {
    try {
      let id = await utils.buildThread(req.body.problem);
      //      console.log("The ID is ", id);
      let report = await utils.runThread(id);

      //      console.log(typeof report, `\n`, report);
      return res.status(200).json({ text: report });
      //.json({ text: "Here is your magic solution from the AI bot." })
    } catch (error) {
      console.log("This is the error - ", error.message);
      res.status(500).send({ message: error.message });
    }
  }
});

app.post("/getfullthread", async function (req, res) {
  if (req.isAuthenticated()) {
    //console.log("Needs update: ", req.body.needsUpdate);

    const accountData = await Account.findOne({
      username: { $eq: req.session.passport.user },
    });
    const id = accountData.threadId;
    //    console.log(id);
    try {
      const data = await utils.RetrieveAndUpdateThread(accountData);
      await Account.findOneAndUpdate(
        {
          username: req.session.passport.user,
        },
        {
          $set: { scopeNeedsUpdate: "false" },
        }
      ).catch((err) => console.log(err));
      //      console.log(data.messages);
      return res.status(200).json({ data: data });
    } catch (error) {
      console.log("This is the error - ", error.message);
      res.status(500).send({ message: error.message });
    }
  } else {
    res.status(500).send({ message: "auth error" });
  }
});

app.listen(port, () => {
  logger.log({
    level: "info",
    message: `Server started.  Listening on port ${port}`,
  });
});
