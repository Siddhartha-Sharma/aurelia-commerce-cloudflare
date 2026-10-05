# Local SonarQube

Install Docker Desktop with Linux containers and start it. Use the compose file in the UI repo once for both projects:

```powershell
docker compose -f tooling/sonar/compose.yml up -d
```

Open http://localhost:9000. Initial login admin/admin; change the password. Create projects manually using keys aurelia-commerce-ui and aurelia-commerce-cloudflare. Generate an analysis token under My Account > Security. Keep tokens out of files/Git.

In each repository, set SONAR_TOKEN in the terminal and run:

```powershell
powershell -File scripts/sonar-local.ps1
```

The scanner receives SONAR_TOKEN from the environment. Run tests separately before scanning. Scan reports are not test execution or proof of runtime correctness. Coverage is not claimed: current tests do not generate LCOV; add a measured report and sonar.javascript.lcov.reportPaths later.

Server logs: docker compose -f tooling/sonar/compose.yml logs --tail 100 (from UI repo). Stop: docker compose -f tooling/sonar/compose.yml stop. Named volumes preserve local results. This uses the embedded database for local evaluation only, not production hosting. Image tags are floating; pin a tested image digest before using this in CI.

Setup status: Docker/Java were not available on this PC during configuration; server startup and actual scan are not yet verified. Git project branches are not configured as Sonar branch parameters; these are two separate local projects.

Official references: https://docs.sonarsource.com/sonarqube-community-build/analyzing-source-code/scanners/sonarscanner and https://docs.sonarsource.com/sonarqube-community-build/analyzing-source-code/test-coverage/javascript-typescript-test-coverage

