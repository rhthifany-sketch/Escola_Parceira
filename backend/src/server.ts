import "dotenv/config";
import { createApp } from "./app";
import { startScheduler } from "./services/scheduler";

const port = Number(process.env.PORT ?? 3333);
createApp().listen(port, () => {
  console.log(`Escola Parceira — API na porta ${port}`);
  startScheduler();
});
