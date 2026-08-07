const express = require("express");
const router = express.Router();
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const TrafficCongestionManager = require("../model/trafficCongestionLib");
const CongestionManager = new TrafficCongestionManager();

/* get the congestion level of a corridor: /api/v1/traffic/corridor/metrics */
router.get("/corridor/metrics", async (req, res) => {
  const apiTrafficResponse = await CongestionManager.getCorridorTravelMetrics();
  console.log(apiTrafficResponse.data);
  res.status(200).send(apiTrafficResponse.data);
});

/* check if a corridor exists: /api/v1/traffic/corridor/exists*/
router.get("/corridor/exists", async (req, res) => {
  const isExistant =
    await CongestionManager.checkIfCorridorExists("Jinja_road");
  console.log(isExistant);
  res.send(isExistant);
});

// fetch corridor by Id from Db: /api/v1/traffic/corridor/id
router.get("/corridor/id", async (req, res) => {
  const corridorId = await CongestionManager.getCorridorId("Jinja_road");
  console.log(corridorId);
  res.send(corridorId);
});

// register a corridor: /api/v1/traffic/corridor/register
router.get("/corridor/register", async (req, res) => {
  const regResult = await CongestionManager.registerCorridorToDb(
    "Jinja_road",
    "Jinja Road Corridor",
    "Stanbic Kireka",
    "NEMA House",
  );
  res.send(regResult);
});

// register raw collected traffic data: /api/v1/traffic/route/register
router.get("/route/register", async (req, res) => {
  const result = await CongestionManager.registerTrafficObservationRecord();
  res.send(result);
});

// start:::create a traffic summary object: /api/v1/traffic/data/summary
// needs traffic observations file.output is traffic_summary.jsons
router.get("/data/summary", (req, res) => {
  const datasetFile = path.join(
    __dirname,
    "../data",
    "traffic_observations.json",
  );

  const trafficSummaryFile = path.join(
    __dirname,
    "../data",
    "traffic_summary.json",
  );

  fs.readFile(datasetFile, "utf8", (err, data) => {
    if (err) {
      return res.status(500).send({ error: err.message });
    }

    try {
      const dataset = JSON.parse(data);
      const routeSummary = CongestionManager.summarizeByHour(dataset);
      fs.writeFileSync(trafficSummaryFile, JSON.stringify(routeSummary));
      res.json(routeSummary);
    } catch (parseErr) {
      res.status(500).send({ error: parseErr.message });
    }
  });
});

// merge traffic summary data to the pm2_5 measurement records: /api/v1/traffic/route/merge
// creates a merged_record.json, takes traffic data & airQo :OOOK
router.get("/route/merge", async (req, res) => {
  try {
    // Load traffic dataset
    const trafficFile = path.join(
      __dirname,
      "../data",
      "traffic_observations.json",
    );
    const trafficData = JSON.parse(fs.readFileSync(trafficFile, "utf8"));
    const trafficSummary = CongestionManager.summarizeByHour(trafficData);

    // Load AirQo dataset
    const airqoFile = path.join(
      __dirname,
      "../data",
      "aggregated_measurements_july_2026.json",
    );
    const airqoData = JSON.parse(fs.readFileSync(airqoFile, "utf8")).data;

    // Merge the traffic summary & airQo data.
    const merged = CongestionManager.mergeTrafficAndAirQo(
      trafficSummary,
      airqoData,
    );

    const mergedFile = path.join(__dirname, "../data", "merged_record.json");

    // save the merged file
    fs.writeFileSync(mergedFile, JSON.stringify(merged, null, 2));

    res.json(merged);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// clean merged records: /api/v1/traffic/data/clean-merged :oook
// Nope::creates and stores clean_merged_record.json
router.get("/data/clean-merged", (req, res) => {
  const cleaned = CongestionManager.cleanData();
  const mergedCleanFile = path.join(
    __dirname,
    "../data",
    "clean_merged_record.json",
  );

  // save the merged file

  // save the merged file
  fs.writeFileSync(mergedCleanFile, JSON.stringify(cleaned, null, 2));
  res.send(cleaned);
});

// F:standardise airqo data takes the aggregated airqo data: /api/v1/traffic/data/airqo/standardise
// final shape: {hour, pm25, temperature, humidity, site}
router.get("/data/airqo/standardise", async (req, res) => {
  const inputFile = path.join(
    __dirname,
    "../data",
    "aggregated_measurements_july_2026.json",
  );
  const outputFile = path.join(__dirname, "../data", "standardised_airqo.json");

  // AirQo machine learning ready dataset.
  const standardised =
    await CongestionManager.standardiseAirQoDataset(inputFile);
  fs.writeFileSync(outputFile, JSON.stringify(standardised, null, 2));
  res.send(standardised);
});

//"traffic_observations.json",
//aggregated_measurements_july_2026.json
router.get("/practice/affirm", async (req, res) => {
  let pathToTrafficObservations = path.join(
    __dirname,
    "../data",
    "traffic_observations.json",
  );

  const result = fs.readFileSync(pathToTrafficObservations, "utf8");
  const rst = JSON.parse(result);
  console.log(rst);
  //const trafficArray = JSON.parse(result);
  //const total_records = trafficArray.length;
  //console.log(rst.data.length);
  //const hourlyBucket = CongestionManager.groupByHour(trafficArray);
  //const hourToRecordPair = Object.entries(hourlyBucket);
  res.send("hourToRecordPair");
});

/* cron job to execute the collection every 15 mins:  */
// cron.schedule("*/1 * * * *", async () => {
//   try {
//     const result = await CongestionManager.registerTrafficObservationRecord();
//     console.log("Observation Saved:", result);
//   } catch (ex) {
//     console.log("error saving observation:", err);
//   }
// });

module.exports = router;
