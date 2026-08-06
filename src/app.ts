import express from 'express';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import routes from './routes';
import securityHeaders from './middlewares/security-headers';
import { loadMondaySecretsIntoEnv } from './utils/load-monday-secrets';

dotenv.config();
// On monday-code, `code:secret` values aren't injected into process.env (only `code:env`
// vars are). Pull them in here so every `process.env.*` credential read works the same on
// monday-code and locally. Runs before app.listen, so requests always see the secrets.
loadMondaySecretsIntoEnv();

const app = express();
const port = process.env.PORT;

app.disable('x-powered-by');       // don't advertise Express
app.use(securityHeaders);          // security response headers on every route
app.use(bodyParser.json());
app.use(routes);

app.listen(port, () => console.log(`Quickstart app listening at http://localhost:${port}`));

export default app;
