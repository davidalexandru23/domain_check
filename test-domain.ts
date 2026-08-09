import { getDomainProfile } from "./src/server/modules/domain.js";

(async () => {
  const result = await getDomainProfile("edu.gov.ro", 5000);
  console.log(JSON.stringify(result, null, 2));
})();
