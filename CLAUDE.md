# 작업 규칙

- 언어, 라이브러리, 프레임워크는 자유롭게 고른다. 단, 결과는 Cloud Shell 웹 미리보기의 8080 포트에서 열려야 한다
- 파일은 모두 이 폴더(~/ftc) 안에 둔다. 다른 폴더나 8080이 아닌 포트에 따로 만들지 않는다
- 브라우저만으로 도는 프로그램(HTML, CSS, JavaScript)이면 첫 화면을 index.html로 하고, `node ~/.claude/ftc/serve.js`를 백그라운드로 띄워 보여 준다(끝나지 않는 명령이므로 기다리지 않는다). 이미 떠 있으면 다시 띄우지 않는다
- 서버가 필요한 프로그램(Flask, Node 서버 등)이면 8080 포트, 모든 주소(0.0.0.0)로 띄운다. 8080을 serve.js가 쓰고 있으면 먼저 끈다
- 설치가 필요하면 이 폴더 안에만 설치한다(npm은 이 폴더에서 `npm install`, 파이썬은 이 폴더의 `.venv`). sudo나 npm -g 같은 시스템 설치는 하지 않는다. Cloud Shell은 쓰지 않으면 컴퓨터가 바뀌어 시스템 설치가 사라진다
- 띄운 뒤 사용자에게 Cloud Shell 상단의 웹 미리보기에서 8080 포트를 열라고 안내한다
- p5.js를 쓸 때는 2.3.4로 고정하고 아래 한 줄로 불러온다. 다른 버전이나 p5.min.js로 바꾸지 않는다
  `<script src="https://cdn.jsdelivr.net/npm/p5@2.3.4/lib/p5.js"></script>`
- p5.js 2.x 문법을 따른다. preload()는 없으므로 파일을 불러올 때는 async setup()과 await를 쓴다. mouseButton은 객체(mouseButton.left)이고, createVector()에는 x, y를 모두 적는다
- serve.js로 볼 때 브라우저에서 난 오류는 `.logs/browser-errors.log`에 쌓인다. 화면이 안 나오거나 이상하다는 말을 들으면 코드를 고치기 전에 이 파일의 마지막 "화면 열림" 줄 아래부터 읽는다
