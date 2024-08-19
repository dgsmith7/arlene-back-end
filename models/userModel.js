import mongoose from "mongoose";
import passportLocalMongoose from "passport-local-mongoose";

const UserSchema = mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: [true, "Email address already exists"],
    },
    username: {
      type: String,
      required: true,
      unique: [true, "Username already exists"],
    },
    privileges: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
    },
  },
  { collection: "arleneUsers" },
  {
    timestamps: true,
  }
);

UserSchema.plugin(passportLocalMongoose);

export const User = mongoose.model("user", UserSchema);
//module.exports = User;
