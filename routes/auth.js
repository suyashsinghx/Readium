const express = require("express");
const passport = require("passport");
const bcrypt = require("bcrypt");
const db = require("../database/db");

const router = express.Router();
const saltRounds = 11;

//SIGN-UP
router.get("/signup", (req, res) => {
  res.render("signup");
});
router.post("/signup", async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const checkResult = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    if (checkResult.rows.length > 0) {
      return res.redirect("/auth/login"); //user already exist
    } else {
      await bcrypt.hash(password, saltRounds, async (err, hash) => {
        if (err) {
          console.error("ERROR hashing password: ", err);
        } else {
          const result = await db.query(
            "INSERT INTO users (name, email, password) VALUES ($1,$2,$3) RETURNING *",
            [name, email, hash],
          );
          const user = result.rows[0];
          req.login(user, (err) => {
            if (err) return next(err);
            res.redirect("/home");
          });
        }
      });
    }
  } catch (error) {
    console.error(error);
  }
});

//LOGIN
router.get("/login", (req, res) => {
  res.render("login");
});

router.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/home",
    failureRedirect: "/auth/login",
  }),
);

//LOGIN GOOGLE
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  }),
);

router.get(
  "/google/readium",
  passport.authenticate("google", {
    successRedirect: "/home",
    failureRedirect: "/auth/login",
  }),
);

// LOGOUT
router.get("/logout", (req, res) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect("/");
  });
});

// Router for change password in user account section

router.post("/accounts/password", async (req, res) => {
  const { current_password, new_password } = req.body;

  const user = await db.query("SELECT * FROM users WHERE id=$1", [req.user.id]);

  const isMatch = await bcrypt.compare(current_password, user.rows[0].password);

  if (!isMatch) {
    return res.send("Wrong current password");
  }

  const hashed = await bcrypt.hash(new_password, 10);

  await db.query("UPDATE users SET password=$1 WHERE id=$2", [
    hashed,
    req.user.id,
  ]);

  res.redirect("/accounts");
});


module.exports = router;
