if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}
const express = require("express");
const mongoose = require('mongoose');
const cookieParser = require("cookie-parser")
const expressLayouts = require("express-ejs-layouts");
const path = require("path");
const bodyParser = require("body-parser");
const i18n = require('i18n');

const app = express();

// i18n configuration
i18n.configure({
  locales: ['en', 'pt'],
  directory: path.join(__dirname, 'locales'),
  defaultLocale: 'en',
  cookie: 'locale'
});

// Middleware
app.set("port", process.env.PORT || 3000);
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.set("layout", path.join("layouts", "layout"));
app.use(cookieParser())
app.use(express.static(path.join(__dirname)));
app.use(expressLayouts);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const mongoURI = `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@${process.env.MONGO_HOST}/${process.env.MONGO_DBNAME}`;
mongoose.connect(mongoURI, {
  serverSelectionTimeoutMS: 5000
})
.then(() => console.log('MongoDB connected...'))
.catch(err => console.log('MongoDB connection error:', err));


// Initialize i18n
app.use(i18n.init);

// Global Variables Middleware
app.use(require("./layout"));

// Locals
app.use("/assets", express.static(path.resolve(__dirname, 'assets')));

// Routes
app.use("/", require("./routes"));

app.listen(app.get("port"), () => console.log("Server started on port " + app.get("port")));