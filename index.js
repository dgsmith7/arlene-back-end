import express from "express";
// import passport from "passport";
// import session from "express-session";
// import LocalStrategy from "passport-local";
// import { User } from "./models/userModel.js";
// import MongoStore from "connect-mongo";
// import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();
import cors from "cors";
// import { items, orders, profiles, returns } from "./fakeData.js";
import OpenAI from "openai";
const openai = new OpenAI();

const port = `${process.env.PORT}`;
// const mongoString = `${process.env.DO_URI_HEAD}/bbcUsers${process.env.DO_URI_TAIL}`;
// mongoose.connect(mongoString);
// const db = mongoose.connection;
// mongoose.connection.on("connected", () => console.log("connected"));
// mongoose.connection.on("open", () => console.log("open"));
// mongoose.connection.on("disconnected", () => console.log("disconnected"));
// mongoose.connection.on("reconnected", () => console.log("reconnected"));
// mongoose.connection.on("disconnecting", () => console.log("disconnecting"));
// mongoose.connection.on("close", () => console.log("close"));

const app = express();
app.disable("x-powered-by");

// app.use(
//   // for deployed use
//   cors({
//     //    credentials: true,
//     allowedHeaders: ["Accept", "Content-Type"],
//     origin: "https://aviation-readiness-app-nwiqg.ondigitalocean.app",
//     methods: ["POST", "GET"],
//   })
// );

app.use(cors());

// app.use(
//   //  for local dev use
//   cors({
//     //credentials: true,
//     origin: "http://localhost:5173",
//     methods: ["POST", "GET"],
//   })
// );

app.use(express.json());
/*
  Session configuration and utilization of the MongoStore for storing
  the session in the MongoDB database
*/
// app.use(express.urlencoded({ extended: false }));
// app.use(
//   session({
//     secret: "your secret key",
//     resave: false,
//     saveUninitialized: true,
//     store: new MongoStore({ mongoUrl: db.client.s.url }),
//   })
// );

/*
  Setup the local passport strategy, add the serialize and 
  deserialize functions that only saves the ID from the user
  by default.
*/
// const strategy = new LocalStrategy(User.authenticate());
// passport.use(strategy);
// passport.serializeUser(User.serializeUser());
// passport.deserializeUser(User.deserializeUser());
// app.use(passport.initialize());
// app.use(passport.session());

/*
  Beyond this point is all system specific routes.
  All routes are here for simplicity of understanding the tutorial
  /register -- Look closer at the package https://www.npmjs.com/package/passport-local-mongoose
  for understanding why we don't try to encrypt the password within our application
*/
// app.post("/register", function (req, res) {
//   User.register(
//     new User({
//       email: req.body.email,
//       username: req.body.username,
//       privileges: "basic",
//     }),
//     req.body.password,
//     function (err, msg) {
//       if (err) {
//         res.send(err);
//       } else {
//         res.send(req.user.privileges);
//       }
//     }
//   );
// });

/*
  Login routes -- This is where we will use the 'local'
  passport authenciation strategy. If success, send to
  /login-success, if failure, send to /login-failure
*/

// app.post(
//   "/login",
//   passport.authenticate("local", {
//     failureRedirect: "/login-failure",
//     successRedirect: "/login-success",
//   }),
//   (err, req, res, next) => {
//     if (err) {
//       console.log(req.headers);
//       console.log(req.body);
//       console.log("Error >>> ", err);
//       next(err);
//     } else {
//       console.log(req.headers);
//       console.log(req.body);
//       console.log(req.user.privileges);
//       res.send(req.user.privileges);
//     }
//   }
// );

// app.get("/login-failure", (req, res, next) => {
//   console.log("FAILED LOGIN");
//   console.log(req.session);
//   res.send("fail");
// });

// app.get("/login-success", (req, res, next) => {
//   console.log("SUCCESSFUL LOGIN");
//   console.log(req.session);
//   console.log(req.user.privileges);
//   res.send(req.user.privileges);
//   //res.send("Login Attempt was successful.");
// });

// app.post("/logout", function (req, res, next) {
//   req.logout(function (err) {
//     if (err) {
//       return next(err);
//     }
//     res.send("logged out");
//   });
// });

/*
  Protected Route -- Look in the account controller for
  how we ensure a user is logged in before proceeding.
  We call 'isAuthenticated' to check if the request is 
  authenticated or not. 
*/
// app.post("/secured", function (req, res) {
//   console.log(req.user.privileges);
//   //  console.log(req.session);
//   if (req.isAuthenticated()) {
//     res.send({ message: "You made it to the secured profie" });
//   } else {
//     res.send({ message: "You are not authenticated" });
//   }
// });

// app.post("/admin", function (req, res) {
//   //console.log(typeof req.user.privileges);
//   //  console.log(req.session);
//   if (req.isAuthenticated() && req.user.privileges === "admin") {
//     res.send({ message: "You made it to the secured admin dashboard" });
//   } else {
//     res.send({ message: "You are not authenticated for admin privileges" });
//   }
// });

app.post("/advise", async function (req, res) {
  try {
    //const accounts = await User.find({});
    //const users = await db.getCollection("bbcUsers").find({});
    //console.log(db);
    //    console.log(req.body.problem);
    let completion = await openai.chat.completions.create({
      model: "gpt-4o",
      // (response_format = { type: "json_object" }),
      messages: [
        // {
        //   role: "system",
        //   content: "You are a helpful assistant designed to output JSON.",
        // },
        { role: "user", content: req.body.problem },
      ],
    });

    console.log(completion.choices[0]);

    return res.status(200).json({ text: completion.choices[0] });
    //.json({ text: "Here is your magic solution from the AI bot." })
  } catch (error) {
    console.log(error.message);
    res.status(500).send({ message: error.message });
  }
});

// app.post("/api/getSession", (req, res) => {
//   const sessionData = {
//     userId: req.session.userId,
//     // Other session variables
//   };
//   if (req.isAuthenticated() && req.user.privileges === "admin") {
//     res.json(sessionData);
//   } else {
//     res.send({ message: "You are not authenticated for admin privileges" });
//   }
// });

app.listen(port, () => {
  console.log("Server started.");
});
