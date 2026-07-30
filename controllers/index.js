/**
 * @author Hedwig Orieba
 * @version 1.0.0
 */
const congestionManager = require("../model/trafficCongestionMgr");
const airQoTransManager = require("../model/airQoLocationMgr");
const express = require("express");
const cors = require("cors");

const app = express();

app.set("view engine", "pug");
app.set("views", "/views");

app.use(express.json());
app.use(express.static("public"));
app.use(cors({ origin: "http://127.0.0.1:4545" }));

app.use("/api/v1/airQo", airQoTransManager);
app.use("/api/v1/traffic", congestionManager);

const listening_port = process.env.PORT || 4545;
app.listen(listening_port, () =>
  console.log(`application process listening on port: ${listening_port}`),
);
