if (process.env.NODE_ENV !== "production"){
    require("dotenv").config()
}
const express = require("express")
const expressLayouts = require("express-ejs-layouts")
const path = require("path")
const bodyParser = require("body-parser")
const getArticlesList = require('./utils/get-articles-list');

const app = express()

//Middleware
app.set("port", process.env.PORT || 3000)
app.set("views", path.join(__dirname, "views"))
app.set("view engine", "ejs")
app.set("layout",path.join("layouts","layout"))
app.use(express.static(path.join(__dirname)))
app.use(expressLayouts)
app.use(bodyParser.urlencoded({ extended: false }))

// Global Variables Middleware
app.use((req, res, next) => {
  articles = getArticlesList()
  title = "Carlos Junior";
  darkModeClass= res.locals.darkModeClass;
  next();
});

//Locals
app.use("/assets", express.static(path.resolve(__dirname, 'assets')))

//Routes
app.use("/", require("./routes"))

app.listen(app.get("port"), () =>
  console.log("Server started on port " + app.get("port"))
);
