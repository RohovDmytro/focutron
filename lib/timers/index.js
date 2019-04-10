const { app, Tray, net, Menu } = require("electron");
const findLocalDevices = require("local-devices");
const path = require("path");
const {
  flow,
  map,
  flatten,
  compact,
  filter,
  sortBy,
  reverse
} = require("lodash/fp");

const FAKE_GOOGLE_REQUEST = false;
const URL = "http://192.168.0.106:8008/setup/assistant/alarms";
const TIME_OF_UPDATE = 1000;
const PATH_TO_ICON = path.join(__dirname, "../../iconTemplate.png");
const MAC = "20:df:b9:c0:b8:e3";

let mainWindow;
let intervalID;
let CACHE = {
  GOOGLE_DEVICE_IP: "192.168.0.106"
};

const getGoogleDeviceIP = async () => {
  if (CACHE.GOOGLE_DEVICE_IP) {
    return CACHE.GOOGLE_DEVICE_IP;
  }

  const devices = await findLocalDevices();
  const device = devices.find(device => device.mac === MAC);
  return device.ip;
};

const getGoogelData = async ({ ip }) => {
  const URL = `http://${ip}:8008/setup/assistant/alarms`;

  const p = new Promise((resolve, reject) => {
    const request = net.request(URL);
    request.on("response", response => {
      response.on("data", chunk => resolve(JSON.parse(chunk)));
      response.on("end", () => {});
    });
    request.on("error", reject);
    request.end();
  });

  return p;
};

const getTimerHumanDuration = flow(
  timer => timer.fire_time - Date.now(),
  duration => {
    const hours = Math.floor(duration / (60 * 60 * 1000));
    const minutes = Math.floor((duration % (60 * 60 * 1000)) / (60 * 1000));
    const sec = Math.floor(
      ((duration % (60 * 60 * 1000)) % (60 * 1000)) / 1000
    );

    return `${hours > 0 ? hours + ":" : ""}${String(minutes).padStart(
      2,
      "0"
    )}:${String(sec).padStart(2, "0")}`;
  }
);

const transformGoogleDataToTrayTitle = flow(
  data => data.timer || [],
  filter(timer => timer.status === 1),
  sortBy(timer => timer.fire_time),
  timers => timers[0],
  timer => (!!timer ? getTimerHumanDuration(timer) : undefined)
);

const setTrayTitle = ({ tray, googleData }) => {
  const title = transformGoogleDataToTrayTitle(googleData) || "—";
  tray.setTitle(title);
};

const createContextMenu = googleData => {
  const template = flow(
    data => data.timer,
    filter(timer => timer.status === 1),
    sortBy(timer => timer.fire_time),
    map(timer => [
      timer.label
        ? {
            id: timer.id + "_label",
            label: timer.label,
            enabled: false
          }
        : null,
      {
        id: timer.id + "_value",
        label: getTimerHumanDuration(timer)
      },
      {
        id: timer.id + "_separator",
        type: "separator"
      }
    ]),
    flatten,
    compact
  )(googleData);

  template.push({
    label: "Quit",
    role: "quit"
  });
  const contextMenu = Menu.buildFromTemplate(template);
  return contextMenu;
};

const setTrayContextMenu = ({ tray, task, googleData }) => {
  const contextMenu = createContextMenu(googleData);
  tray.setContextMenu(contextMenu);

  contextMenu.on("menu-will-show", task.stop);
  contextMenu.on("menu-will-close", task.start);
};

const setAll = async () => {
  const tray = new Tray(PATH_TO_ICON);
  const setTray = async () => {
    try {
      const ip = await getGoogleDeviceIP();
      const googleData = await getGoogelData({ ip });
      setTrayContextMenu({ tray, googleData, task });
      setTrayTitle({ tray, googleData, task });
    } catch (e) {
      /*
      console.log("CAUGHT ERROR!");
      console.log(e.message);
      console.log("\n");
      */
      delete CACHE.GOOGLE_DEVICE_IP;
      console.log(e);
      tray.setTitle(`{ERR}`);
    }
  };
  const task = {
    id: undefined,
    start: () => {
      task.id = setInterval(setTray, TIME_OF_UPDATE);
    },
    stop: () => {
      clearInterval(task.id);
    }
  };

  task.start();
};

const onReady = () => {
  setAll();
};

app.on("ready", onReady);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) onReady();
});

app.dock.hide();
