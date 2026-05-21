<?php

declare(strict_types=1);

header("Content-Type: application/json; charset=utf-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Accept, Authorization");
header("Access-Control-Max-Age: 86400");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(204);
    exit;
}

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    http_response_code(405);
    echo json_encode(["error" => "Metodo nao permitido. Use POST."]);
    exit;
}

$rawBody = file_get_contents("php://input");
$payload = json_decode($rawBody ?: "", true);

if (!is_array($payload) || !isset($payload["cpf"])) {
    http_response_code(400);
    echo json_encode(["error" => "Campo cpf obrigatorio."]);
    exit;
}

$cpf = preg_replace("/\D+/", "", (string) $payload["cpf"]);
if ($cpf === null || strlen($cpf) !== 11) {
    http_response_code(422);
    echo json_encode(["error" => "CPF invalido. Informe 11 digitos."]);
    exit;
}

$apiUrl = "https://telemedicina.icamedtec.com.br/api/clinic/login-patient/";
$bearerToken = "Bearer XlFIqVYD4c_91p7qGfvht9R5S4xFMTKJEtsWDDM01AAAHVWOm6yyehcDc6ehvF6d";

$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_URL => $apiUrl,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_ENCODING => "",
    CURLOPT_MAXREDIRS => 10,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
    CURLOPT_CUSTOMREQUEST => "POST",
    CURLOPT_POSTFIELDS => json_encode(["cpf" => $cpf], JSON_UNESCAPED_UNICODE),
    CURLOPT_HTTPHEADER => [
        "Authorization: " . $bearerToken,
        "Content-Type: application/json",
        "User-Agent: appicamedtec-backend/1.0",
    ],
]);

$response = curl_exec($ch);
$curlError = curl_error($ch);
$statusCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($curlError !== "") {
    http_response_code(502);
    echo json_encode(["error" => "Falha na comunicacao com API externa.", "detail" => $curlError]);
    exit;
}

if (!is_string($response) || $response === "") {
    http_response_code(502);
    echo json_encode(["error" => "Resposta vazia da API externa."]);
    exit;
}

$decoded = json_decode($response, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(502);
    echo json_encode(["error" => "Resposta invalida da API externa.", "raw" => $response]);
    exit;
}

if (is_array($decoded)) {
    $decoded = normalize_login_response($decoded);
}

if ($statusCode > 0) {
    http_response_code($statusCode);
}

echo json_encode($decoded, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

/**
 * Garante campo magic_link para o app, independente do formato da API DrTis.
 *
 * @param array<string, mixed> $payload
 * @return array<string, mixed>
 */
function normalize_login_response(array $payload): array
{
    if (!empty($payload["magic_link"]) && is_string($payload["magic_link"])) {
        return $payload;
    }

    $linkKeys = [
        "magicLink",
        "shortenedRedirect",
        "unshortenedRedirect",
        "patientUrl",
        "redirect",
        "url",
    ];

    foreach ($linkKeys as $key) {
        if (!empty($payload[$key]) && is_string($payload[$key])) {
            $payload["magic_link"] = $payload[$key];
            break;
        }
    }

    return $payload;
}
