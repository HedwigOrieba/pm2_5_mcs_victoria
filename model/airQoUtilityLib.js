/**
 *  @author Hedwig Orieba
 *  @version 1.0.0
 */
const axios = require("axios");
const config = require("config");
const path = require("path");
const fs = require("fs");

class AirQoUtilityManager {
  // Start Class
  /* Method to dynamically geocode route locations */
  async geocodePlace(name) {
    const apiKey = config.get("google_apiKey");
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(name)}&key=${apiKey}`;
    const res = await axios.get(url);
    const loc = res.data.results[0].geometry.location;
    return { name, latitude: loc.lat, longitude: loc.lng };
  }

  /* Method to build a route corridor */
  async buildCorridor() {
    const origin = await this.geocodePlace(
      "Stanbic Bank, Kireka Branch, Kampala, Uganda",
    );
    const destination = await this.geocodePlace("NEMA House, kampala, Uganda");

    // Including source & destination for nearest sensor detection.9 Waypoints
    const waypoints = await Promise.all([
      this.geocodePlace("Stanbic Bank, Kireka Branch, Kampala, Uganda"),
      this.geocodePlace("Banda Taxi Stage, Kireka Jinja High Way, Uganda"),
      this.geocodePlace("City Oil Nakawa, Kampala Jinja High Way, Uganda"),
      this.geocodePlace("Spear Motors, Kampala Jinja High Way, Uganda"),
      this.geocodePlace("Nakawa Taxi Park, Kampala Jinja High Way, Uganda"),
      this.geocodePlace("Kyadondo Rugby Club, Kampala Jinja High Way, Uganda"),
      this.geocodePlace(
        "Motorcare Nissan Uganda, Kampala Jinja High Way, Uganda",
      ),
      this.geocodePlace("Wampewo Clock Tower, Kampala Jinja High Way, Uganda"),
      this.geocodePlace("Kitgum House, Kampala Jinja High Way, Uganda"),
      this.geocodePlace("Bank of India (U) Ltd, Kampala Main Branch, Uganda"),
      this.geocodePlace("NEMA House, kampala, Uganda"),
    ]);

    const route_corridor = {
      id: "Jinja-Road",
      name: "Jinja Road Corridor",
      origin,
      destination,
      airqoMap: "https://ai.airqo.net/map",
      waypoints,
      sensors: [
        "Kireka, Kira Municipality",
        "Kyambogo University",
        "MUBS Nakawa",
        "Nakawa Division KCCA",
        "Civic Centre Kampala",
        "NEMA House",
      ],
    };
    return route_corridor;
  }

  /* Method to get the nearest Sensors to a corridor */
  async getCorridorNearestSensors() {
    const corridor = await this.buildCorridor();
    const onlineSensors = await this.getOnlyOnlineSites();
    const nearestSensors = corridor.waypoints.map((waypoint) => {
      const foundNearest = this.findNearestSensor(
        { latitude: waypoint.latitude, longitude: waypoint.longitude },
        onlineSensors,
      );
      return {
        waypoint: waypoint.name,
        waypoint_lat: waypoint.latitude,
        waypoint_lng: waypoint.longitude,
        nearest_sensor: foundNearest.name,
        sensor_id: foundNearest._id,
        sensor_lat: foundNearest.approximate_latitude,
        sensor_lng: foundNearest.approximate_longitude,
        distance_km: foundNearest.distance_km,
        isOnline: foundNearest.isOnline,
        lastRawData: foundNearest.lastRawData,
      };
    });

    // logging to the console waypoint/distance of nearest sensor
    nearestSensors.forEach((sensor, x) => {
      console.log(
        `WayPoint: ${corridor.waypoints[x].name} :: Nearest Sensor: ${sensor.nearest_sensor} ${sensor.distance_km.toFixed(2)} km`,
      );
    });

    return nearestSensors;
  }

  /* Method to get all AirQo published grids */
  async getAllAirQoGrids() {
    try {
      const baseUrl = config.get("baseUrl");
      const accessToken = config.get("access_token");

      const gridsMetaObject = await axios.get(
        baseUrl.concat(`/api/v2/devices/grids/summary?token=${accessToken}`),
      );
      return gridsMetaObject.data.grids;
    } catch (ex) {
      console.log("Error:", ex.message);
    }
  }

  /* Method to get Kampala Specific AirQo grids  */
  async getAllKampalaSpecificAirQoGrids() {
    try {
      const allAirQoDefinedGrids = await this.getAllAirQoGrids();
      const allKampalaAirQoGrids = allAirQoDefinedGrids.filter((grid) =>
        grid.sites.some(
          (site) => site.country === "Uganda" && site.district === "Kampala",
        ),
      );
      return allKampalaAirQoGrids;
    } catch (ex) {
      console.log(ex.message);
    }
  }

  /* Method to get all sites in Kampala specific AirQo grids */
  async getSitesFromAllKampalaGrids() {
    try {
      const combinedAllKampalaAirQoSites =
        await this.getAllKampalaSpecificAirQoGrids();
      return combinedAllKampalaAirQoSites.flatMap((grid) => grid.sites);
      //return combinedAllKampalaAirQoSites;
    } catch (ex) {
      console.log(ex.message);
    }
  }

  /* Method to get only online kampala sites */
  async getOnlyOnlineSites() {
    try {
      /* extracting the list of only on-line sites */
      const onlineKampalaAirQoSites = await this.getSitesFromAllKampalaGrids();
      const filtered = await onlineKampalaAirQoSites.filter(
        (site) => site.isOnline === true,
      );
      return filtered;
    } catch (ex) {
      console.log(ex.message);
    }
  }

  /* Haversion formula to calculate great-circle distance between lat/lng points */
  haversionDistance(coord1, coord2) {
    const R = 6371; // approximate earth radius
    const toRad = (deg) => (deg * Math.PI) / 180;

    const dLat = toRad(coord2.latitude - coord1.latitude);
    const dLon = toRad(coord2.longitude - coord1.longitude);

    const lat1 = toRad(coord1.latitude);
    const lat2 = toRad(coord2.latitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // distance in km
  }

  /* find nearest sensor for each corridor stop */
  /* Takes a reference point & an array of sensors that will provide sensor coordinates. */
  findNearestSensor(point, sensors) {
    let nearest = null;
    let minDistance = Infinity;

    sensors.forEach((sensor) => {
      const distance = this.haversionDistance(point, {
        latitude: sensor.approximate_latitude,
        longitude: sensor.approximate_longitude,
      });

      if (distance < minDistance) {
        minDistance = distance;
        nearest = sensor;
      }
    });

    return { ...nearest, distance_km: minDistance };
  }

  /* Get PM2.5 Sensor Measurement */
  async getPm25ForEachNearestSensor() {
    try {
      const baseUrl = config.get("baseUrl");
      const clientSecret = config.get("client_secret");
      const accessToken = config.get("access_token");
      const url = baseUrl.concat(
        `/api/v3/public/analytics/data-download?token=${accessToken}`,
      );
      const detectedNearestSensors = await this.getCorridorNearestSensors();
      const sensorIds = detectedNearestSensors.map(
        (sensor) => sensor.sensor_id,
      );
      /* fetching pm2.5 from 1 july to 31 July 2026. */
      const body = {
        network: "airqo",
        startDateTime: "2026-07-01T00:00:00Z",
        endDateTime: "2026-07-31T23:59:59Z",
        datatype: "calibrated",
        downloadType: "json",
        frequency: "hourly",
        sites: sensorIds,
        device_category: "lowcost",
        pollutants: ["pm2_5"],
        metaDataFields: ["latitude", "longitude"],
        weatherFields: ["temperature", "humidity"],
        outputFormat: "airqo-standard",
      };
      //outputFormat: "aqcsv" or "airqo-standard"
      const sensorResponse = await axios.post(url, body, {
        headers: {
          "Content-Type": "application/json",
          "X-Client-Secret": clientSecret,
        },
      });
      const measurementsFilePath = path.join(
        __dirname,
        "../data",
        "aggregated_measurements.json",
      );
      fs.writeFile(
        measurementsFilePath,
        JSON.stringify(sensorResponse.data, null, 2),
        (err) => {
          if (err) console.log(err.message);
          console.log("Required Sensor data saved successfully!!");
        },
      );
      return { operation: "AirQo Data Importation", status: "Success!!!" };
    } catch (ex) {
      console.log("Error fetching Pm2.5: ", ex);
      return null;
    }
  }
} // end class

module.exports = AirQoUtilityManager;
