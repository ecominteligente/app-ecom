
<?php



use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

/*
|--------------------------------------------------------------------------
| Carrega PHPMailer
|--------------------------------------------------------------------------
*/
require __DIR__ . '/../assets/vendor/PHPMailer/src/Exception.php';
require __DIR__ . '/../assets/vendor/PHPMailer/src/PHPMailer.php';
require __DIR__ . '/../assets/vendor/PHPMailer/src/SMTP.php';

/*
|--------------------------------------------------------------------------
| Permite apenas POST
|--------------------------------------------------------------------------
*/
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(403);
  exit;
}

/*
|--------------------------------------------------------------------------
| Coleta e valida dados
|--------------------------------------------------------------------------
*/
$nome     = trim($_POST['name'] ?? '');
$email    = trim($_POST['email'] ?? '');
$assunto  = trim($_POST['subject'] ?? 'Contato pelo site');
$mensagem = trim($_POST['message'] ?? '');

if ($nome === '' || $mensagem === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
  http_response_code(400);
  echo 'Preencha todos os campos corretamente.';
  exit;
}

/*
|--------------------------------------------------------------------------
| Envio via SMTP (LOCAWEB - CORRIGIDO)
|--------------------------------------------------------------------------
*/
$mail = new PHPMailer(true);

try {
  // 🔥 CONFIGURAÇÃO CORRETA LOCAWEB
  $mail->isSMTP();
  $mail->Host = 'smtp.locaweb.com.br';
  $mail->SMTPAuth = true;
  $mail->Username = 'contato@ecominteligente.com.br';
  $mail->Password = 'Ecom!@*2026'; // ⚠️ troque depois por segurança

  $mail->SMTPSecure = 'tls';
  $mail->Port = 587;

  $mail->CharSet = 'UTF-8';
  $mail->Timeout = 15;

  // Remetente e destinatário
  $mail->setFrom('contato@ecominteligente.com.br', 'Ecom Inteligente');
  $mail->addAddress('contato@ecominteligente.com.br');
  $mail->addReplyTo($email, $nome);

  // Conteúdo
  $mail->isHTML(false);
  $mail->Subject = $assunto;
  $mail->Body =
    "Nome: {$nome}\n" .
    "Email: {$email}\n\n" .
    "Mensagem:\n{$mensagem}";

  // Envia
  $mail->send();

  // 🔥 IMPORTANTE: seu JS espera exatamente "OK"
  echo 'OK';

} catch (Exception $e) {
  http_response_code(500);
  echo 'Erro: ' . $mail->ErrorInfo; // aparece no form automaticamente
}