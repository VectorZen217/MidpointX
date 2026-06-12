const fs = require('fs').promises;

async function generateTestData() {
    const data = [{ id: "api", name: "API", desc: "Backend" }, { id: "db", name: "DB", desc: "Storage" }];
    const data_flow = [{"from": "User", "to": "API"}, {"from": "API", "to": "DB"}];

    await Promise.all([
        fs.writeFile('test_data.json', JSON.stringify(data)),
        fs.writeFile('test_data_flow.json', JSON.stringify(data_flow))
    ]);

    console.log("Test data files created.");
}

generateTestData().catch(console.error);
