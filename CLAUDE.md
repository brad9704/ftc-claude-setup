# 작업 규칙

- 결과물은 웹 브라우저에서 도는 프로그램으로 만든다. HTML, CSS, JavaScript와 p5.js만 쓴다
- p5.js는 2.3.4로 고정하고 index.html에서 아래 한 줄로 불러온다. 다른 버전이나 p5.min.js로 바꾸지 않는다
  `<script src="https://cdn.jsdelivr.net/npm/p5@2.3.4/lib/p5.js"></script>`
- p5.js 2.x 문법을 따른다. preload()는 없으므로 파일을 불러올 때는 async setup()과 await를 쓴다. mouseButton은 객체(mouseButton.left)이고, createVector()에는 x, y를 모두 적는다
- 다른 라이브러리, 프레임워크, 빌드 도구, npm 설치는 쓰지 않는다
- 파일은 이 폴더에 두고, 첫 화면은 index.html로 한다
- 화면 확인: `node ~/.claude/ftc/serve.js`를 백그라운드로 띄운다(끝나지 않는 명령이므로 기다리지 않는다). 그다음 사용자에게 Cloud Shell 상단의 웹 미리보기에서 8080 포트를 열라고 안내한다. 이미 떠 있으면 다시 띄우지 않는다
- 브라우저에서 난 오류는 `.logs/browser-errors.log`에 쌓인다. 화면이 안 나오거나 이상하다는 말을 들으면 코드를 고치기 전에 이 파일의 마지막 "화면 열림" 줄 아래부터 읽는다
