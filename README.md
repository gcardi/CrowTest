# CrowTest

Un semplice server HTTP C++ creato con CMake, MinGW e Crow (header-only).

## Descrizione

Questo repository contiene un esempio di server HTTP scritto in C++ utilizzando la libreria Crow. Il server risponde su porta 18080 con endpoint di esempio.

## Requisiti

- MinGW
- CMake
- GCC / G++ (con supporto C++17)

## Come compilare

```powershell
cmake --preset=mingw
cmake --build out/build/mingw
```

## Eseguire

```powershell
.\out\build\mingw\CrowTest.exe
```

Il server sarà disponibile su http://localhost:18080/

## Endpoint

- `GET /` - Messaggio di benvenuto
- `GET /hello/<nome>` - Saluto personalizzato

## Licenza

Distribuito sotto licenza MIT.
