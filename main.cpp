#include <crow.h>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <sstream>

static crow::response serve_static_file(const std::filesystem::path& root, const std::string& rel_path)
{
    std::filesystem::path file_path = root / rel_path;
    std::filesystem::path canon_root = std::filesystem::weakly_canonical(root);
    std::filesystem::path canon_file = std::filesystem::weakly_canonical(file_path);

    if (canon_file.string().rfind(canon_root.string(), 0) != 0) {
        return crow::response(403);
    }

    if (!std::filesystem::exists(canon_file) || !std::filesystem::is_regular_file(canon_file)) {
        return crow::response(404);
    }

    std::ifstream input(canon_file, std::ios::binary);
    if (!input) {
        return crow::response(500);
    }

    std::ostringstream buffer;
    buffer << input.rdbuf();
    crow::response res(buffer.str());

    const auto ext = canon_file.extension().string();
    if (ext == ".html") {
        res.set_header("Content-Type", "text/html; charset=UTF-8");
    } else if (ext == ".css") {
        res.set_header("Content-Type", "text/css; charset=UTF-8");
    } else if (ext == ".js") {
        res.set_header("Content-Type", "application/javascript; charset=UTF-8");
    } else if (ext == ".json") {
        res.set_header("Content-Type", "application/json; charset=UTF-8");
    }

    return res;
}

int main(int argc, char** argv)
{
    crow::SimpleApp app;
    const std::filesystem::path exe_dir = std::filesystem::absolute(argv[0]).parent_path();
    const std::filesystem::path static_root = exe_dir / "static";

    std::cout << "exe_dir=" << exe_dir.string() << "\n";
    std::cout << "static_root=" << static_root.string() << "\n";
    std::cout << "static_exists=" << (std::filesystem::exists(static_root) ? "yes" : "no") << "\n";

    CROW_ROUTE(app, "/")([static_root]() {
        return serve_static_file(static_root, "index.html");
    });

    CROW_ROUTE(app, "/hello/<string>")([](std::string name){
        return "Hello, " + name + "!";
    });

    CROW_ROUTE(app, "/assets/<path>")([static_root](const std::string& path) {
        return serve_static_file(static_root, path);
    });

    try {
        app.port(18080).multithreaded().run();
        std::cout << "server.run() returned normally\n";
    } catch (const std::exception& e) {
        std::cerr << "EXCEPTION: " << e.what() << "\n";
        return 1;
    } catch (...) {
        std::cerr << "EXCEPTION: unknown\n";
        return 1;
    }

    return 0;
}
