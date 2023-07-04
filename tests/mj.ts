import MJ from "../src/midjourney";

new MJ()
.drawImage('color photo of a rice field in the scorching sun, farmers working tirelessly under the heat, capturing the essence of hard work and perseverance —c 10 —ar 2:3')
.then(res => console.log(res));