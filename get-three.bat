@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

if not exist public\lib\addons\controls mkdir public\lib\addons\controls
if not exist public\lib\addons\postprocessing mkdir public\lib\addons\postprocessing
if not exist public\lib\addons\shaders mkdir public\lib\addons\shaders

set B1=https://registry.npmmirror.com/three/0.160.0/files
set B2=https://cdn.jsdelivr.net/npm/three@0.160.0
set B3=https://unpkg.com/three@0.160.0

call :get build/three.module.js lib/three.module.js
call :get examples/jsm/controls/OrbitControls.js lib/addons/controls/OrbitControls.js
call :get examples/jsm/postprocessing/EffectComposer.js lib/addons/postprocessing/EffectComposer.js
call :get examples/jsm/postprocessing/RenderPass.js lib/addons/postprocessing/RenderPass.js
call :get examples/jsm/postprocessing/ShaderPass.js lib/addons/postprocessing/ShaderPass.js
call :get examples/jsm/postprocessing/MaskPass.js lib/addons/postprocessing/MaskPass.js
call :get examples/jsm/postprocessing/Pass.js lib/addons/postprocessing/Pass.js
call :get examples/jsm/postprocessing/UnrealBloomPass.js lib/addons/postprocessing/UnrealBloomPass.js
call :get examples/jsm/postprocessing/OutputPass.js lib/addons/postprocessing/OutputPass.js
call :get examples/jsm/shaders/CopyShader.js lib/addons/shaders/CopyShader.js
call :get examples/jsm/shaders/LuminosityHighPassShader.js lib/addons/shaders/LuminosityHighPassShader.js
call :get examples/jsm/shaders/OutputShader.js lib/addons/shaders/OutputShader.js

echo ALL-DONE
exit /b 0

:get
if exist "public\%~2" (
  echo SKIP %~2
  exit /b 0
)
curl -fsSL --max-time 120 -o "public\%~2" "%B1%/%~1" && ( echo OK %~2 & exit /b 0 )
curl -fsSL --max-time 120 -o "public\%~2" "%B2%/%~1" && ( echo OK-jsdelivr %~2 & exit /b 0 )
curl -fsSL --max-time 120 -o "public\%~2" "%B3%/%~1" && ( echo OK-unpkg %~2 & exit /b 0 )
echo FAIL %~2
exit /b 1
