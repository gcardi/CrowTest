#include <crow.h>
#include <algorithm>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

struct Magnet {
    double x = 0.0;
    double y = 0.0;
    double angle = 0.0;
    double strength = 1.0;
    double size = 0.12;
};

struct FieldRequest {
    int request_id = 0;
    int width = 128;
    int height = 128;
    double world_width = 4.0;
    double world_height = 3.0;
    std::vector<Magnet> magnets;
};

double json_number(const crow::json::rvalue& obj, const char* key, double fallback)
{
    return obj.has(key) ? obj[key].d() : fallback;
}

int json_int(const crow::json::rvalue& obj, const char* key, int fallback)
{
    return obj.has(key) ? static_cast<int>(obj[key].i()) : fallback;
}

FieldRequest parse_field_request(const std::string& message)
{
    auto body = crow::json::load(message);
    if (!body) {
        throw std::runtime_error("Invalid JSON message");
    }

    FieldRequest request;
    request.request_id = json_int(body, "requestId", 0);
    request.width = std::clamp(json_int(body, "width", 128), 32, 384);
    request.height = std::clamp(json_int(body, "height", 128), 32, 384);
    request.world_width = std::clamp(json_number(body, "worldWidth", 4.0), 0.5, 20.0);
    request.world_height = std::clamp(json_number(body, "worldHeight", 3.0), 0.5, 20.0);

    if (body.has("magnets")) {
        const auto& magnets = body["magnets"];
        const auto count = std::min<size_t>(magnets.size(), 64);
        request.magnets.reserve(count);

        for (size_t i = 0; i < count; ++i) {
            const auto& src = magnets[i];
            Magnet magnet;
            magnet.x = std::clamp(json_number(src, "x", 0.0), -10.0, 10.0);
            magnet.y = std::clamp(json_number(src, "y", 0.0), -10.0, 10.0);
            magnet.angle = json_number(src, "angle", 0.0);
            magnet.strength = std::clamp(json_number(src, "strength", 1.0), -20.0, 20.0);
            magnet.size = std::clamp(json_number(src, "size", 0.12), 0.03, 1.0);
            request.magnets.push_back(magnet);
        }
    }

    return request;
}

std::string compute_field_response(const FieldRequest& request)
{
    std::vector<double> bx_values;
    std::vector<double> by_values;
    std::vector<double> magnitudes;
    bx_values.resize(static_cast<size_t>(request.width) * request.height);
    by_values.resize(bx_values.size());
    magnitudes.resize(bx_values.size());

    double max_magnitude = 0.0;
    const double half_w = request.world_width * 0.5;
    const double half_h = request.world_height * 0.5;

    for (int row = 0; row < request.height; ++row) {
        const double y = half_h - (request.world_height * row) / (request.height - 1);

        for (int col = 0; col < request.width; ++col) {
            const double x = -half_w + (request.world_width * col) / (request.width - 1);
            double bx = 0.0;
            double by = 0.0;

            for (const auto& magnet : request.magnets) {
                const double dx = x - magnet.x;
                const double dy = y - magnet.y;
                const double mx = std::cos(magnet.angle) * magnet.strength;
                const double my = std::sin(magnet.angle) * magnet.strength;
                const double softening = std::max(0.025, magnet.size * 0.45);
                const double r2 = dx * dx + dy * dy + softening * softening;
                const double inv_r = 1.0 / std::sqrt(r2);
                const double inv_r3 = inv_r * inv_r * inv_r;
                const double inv_r5 = inv_r3 / r2;
                const double dot = mx * dx + my * dy;

                bx += 3.0 * dx * dot * inv_r5 - mx * inv_r3;
                by += 3.0 * dy * dot * inv_r5 - my * inv_r3;
            }

            const size_t index = static_cast<size_t>(row) * request.width + col;
            const double magnitude = std::sqrt(bx * bx + by * by);
            bx_values[index] = bx;
            by_values[index] = by;
            magnitudes[index] = magnitude;
            max_magnitude = std::max(max_magnitude, magnitude);
        }
    }

    std::ostringstream out;
    out.setf(std::ios::fixed);
    out << std::setprecision(6);
    out << "{\"type\":\"field\",\"requestId\":" << request.request_id
        << ",\"width\":" << request.width
        << ",\"height\":" << request.height
        << ",\"worldWidth\":" << request.world_width
        << ",\"worldHeight\":" << request.world_height
        << ",\"maxMagnitude\":" << max_magnitude
        << ",\"values\":[";

    for (size_t i = 0; i < bx_values.size(); ++i) {
        if (i != 0) {
            out << ',';
        }
        out << '[' << bx_values[i] << ',' << by_values[i] << ',' << magnitudes[i] << ']';
    }

    out << "]}";
    return out.str();
}

std::string compute_field_response(const std::string& message)
{
    return compute_field_response(parse_field_request(message));
}

std::string error_response(const std::string& message)
{
    std::ostringstream out;
    out << "{\"type\":\"error\",\"message\":\"";
    for (const char c : message) {
        if (c == '"' || c == '\\') {
            out << '\\';
        }
        if (c >= 32) {
            out << c;
        }
    }
    out << "\"}";
    return out.str();
}

} // namespace

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

    CROW_ROUTE(app, "/api/field").methods(crow::HTTPMethod::Post)([](const crow::request& req) {
        try {
            crow::response res(compute_field_response(req.body));
            res.set_header("Content-Type", "application/json; charset=UTF-8");
            return res;
        } catch (const std::exception& e) {
            crow::response res(400, error_response(e.what()));
            res.set_header("Content-Type", "application/json; charset=UTF-8");
            return res;
        }
    });

    CROW_WEBSOCKET_ROUTE(app, "/ws/field")
        .onopen([](crow::websocket::connection&) {
            std::cout << "field websocket opened\n";
        })
        .onmessage([](crow::websocket::connection& conn, const std::string& message, bool is_binary) {
            if (is_binary) {
                conn.send_text(error_response("Binary requests are not supported yet"));
                return;
            }

            try {
                conn.send_text(compute_field_response(message));
            } catch (const std::exception& e) {
                conn.send_text(error_response(e.what()));
            }
        })
        .onerror([](crow::websocket::connection&, const std::string& message) {
            std::cerr << "field websocket error: " << message << "\n";
        })
        .onclose([](crow::websocket::connection&, const std::string& reason, uint16_t) {
            std::cout << "field websocket closed: " << reason << "\n";
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
