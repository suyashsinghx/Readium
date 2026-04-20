var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");

const passport = require("passport");
const session = require("express-session");

require("dotenv").config();

var usersRouter = require("./routes/users");
require("./config/passport"); //connect passport.js

var app = express();

//Session-SetUp
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  }),
);


app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public")));

//possport-initialization
app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  res.locals.user = req.user || null;
  next();
});
// ROUTES
app.use("/", require("./routes/index"));
app.use("/auth", require("./routes/auth"));

app.use(cookieParser());

app.set("view engine", "ejs");
app.set("views", "./views");

app.use((req, res) => {
  res.status(404).render("error");
});

app.use("/users", usersRouter);

module.exports = app;
