const passport = require("passport");
const { Strategy } = require("passport-local");
const GoogleStrategy = require("passport-google-oauth20");
const db = require("../database/db");
const bcrypt = require("bcrypt");

//LOCAL-LOGIN strategy
passport.use(
  "local",
  new Strategy({ usernameField: "email" }, async function verify(
    email,
    password,
    cb,
  ) {
    try {
      const result = await db.query("SELECT * FROM users WHERE email = $1", [
        email,
      ]);

      if (result.rows.length > 0) {
        const userData = result.rows[0];

        bcrypt.compare(password, userData.password, (err, valid) => {
          if (err) return cb(err);

          if (valid) return cb(null, userData);
          else return cb(null, false);
        });
      } else {
        return cb(null, false);
      }
    } catch (err) {
      return cb(err);
    }
  }),
);

//GOOGLE LOGIN
passport.use(
  "google",
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // callbackURL: "http://localhost:3000/auth/google/readium",  //only when run on local
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
      userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
    },
    async (accessToken, refreshToken, profile, cb) => {
      try {
        const email = profile.emails?.[0]?.value;

        if (!email) {
          return cb(new Error("No email from Google"));
        }

        // check if user already exists
        const existingUser = await db.query(
          "SELECT * FROM users WHERE email = $1",
          [email],
        );

        if (existingUser.rows.length > 0) {
          return cb(null, existingUser.rows[0]);
        }

        // create new user
        const newUser = await db.query(
          "INSERT INTO users (name, email, google_id) VALUES ($1, $2, $3) RETURNING *",
          [profile.displayName, email, profile.id],
        );

        return cb(null, newUser.rows[0]);
      } catch (err) {
        return cb(err);
      }
    },
  ),
);

//SESSION STORE--
passport.serializeUser((userData, cb) => {
  return cb(null, userData.id);
});
passport.deserializeUser(async (id, cb) => {
  try {
    const result = await db.query("SELECT * FROM users WHERE id = $1", [id]);
    cb(null, result.rows[0]);
  } catch (err) {
    cb(err, null);
  }
});
