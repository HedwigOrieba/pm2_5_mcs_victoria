/**
 * @author Hedwig Orieba
 * @version 1.0.0
 */
const express = require("express");
const router = express.Router();
const AirQoUtilityManager = require("../model/airQoUtilityLib");
const UtilManager = new AirQoUtilityManager();

/* Return AirQo Corridor meta information: /api/v1/airQo/routes/corridor */
router.get("/routes/corridor", async (req, res) => {
  const routeMetaData = await UtilManager.buildCorridor();
  console.log("Corridor", routeMetaData);
  res.send(await UtilManager.buildCorridor());
});

/* Get nearest sensors to corridor way points:/api/v1/airQo/routes/sensors/nearest */
router.get("/routes/sensors/nearest", async (req, res) => {
  const detectedCorridorNearestSensors =
    await UtilManager.getCorridorNearestSensors();
  res.send(detectedCorridorNearestSensors);
});

/* $$$Return PM2.5 readings along the route points: /api/v1/airQo/routes/sensors/measurements */
router.get("/routes/sensors/pm25/measurements", async (req, res) => {
  const combinedSensorReadings =
    await UtilManager.getPm25ForEachNearestSensor();
  res.send(combinedSensorReadings);
});

/* Return AirQo Map: /api/v1/airQo/maps/show */
router.get("/maps/show", async (req, res) => {
  const corridor = await UtilManager.buildCorridor();
  res.redirect(corridor.airqoMap);
});

/* Return all grids: /api/v1/airQo/grids/all */
router.get("/grids/all", async (req, res) => {
  res.send(await UtilManager.getAllAirQoGrids());
});

/* Return kampala grids: /api/v1/airQo/grids/kampala */
router.get("/grids/kampala", async (req, res) => {
  res.send(await UtilManager.getAllKampalaSpecificAirQoGrids());
});

/* Return all kampala sites: /api/v1/airQo/sites/kampala */
router.get("/sites/kampala", async (req, res) => {
  res.send(await UtilManager.getSitesFromAllKampalaGrids());
});

/* Return online kampala sites: /api/v1/airQo/sites/kampala/online */
router.get("/sites/kampala/online", async (req, res) => {
  res.send(await UtilManager.getOnlyOnlineSites());
});

module.exports = router;
