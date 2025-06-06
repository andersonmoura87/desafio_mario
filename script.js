function atualizar() {
    const input = document.getElementById('progresso');
    const progresso = parseInt(input.value);
    
    // Validar input
    if (progresso < 0) input.value = 0;
    if (progresso > 100) input.value = 100;
    
    // Atualizar barra de progresso
    const fill = document.getElementById('fill');
    const percentText = document.getElementById('percent-text');
    const mario = document.getElementById('mario');
    const progressBar = document.getElementById('bar');
    percentText.textContent = `${progresso}%`;
    
    // Trocar cor da barra inteira
    if (progresso <= 50) {
        progressBar.style.background = '#e74c3c'; // vermelho
    } else if (progresso <= 95) {
        progressBar.style.background = '#ffcc00'; // amarelo
    } else {
        progressBar.style.background = '#27ae60'; // verde
    }
    
    // Ajustar posição do Mario na extremidade do preenchimento (lado esquerdo do Mario)
    const barWidth = progressBar.offsetWidth;
    const marioWidth = mario.offsetWidth;
    let fillWidth = (progresso / 100) * barWidth;
    if (fillWidth > barWidth - marioWidth) fillWidth = barWidth - marioWidth;
    if (fillWidth < 0) fillWidth = 0;
    fill.style.width = `${fillWidth}px`;
    mario.style.left = `${fillWidth}px`;
    
    // Trocar imagem do Mario
    if (progresso >= 100) {
        mario.style.backgroundImage = "url('imagens/task_complete2.jpg')";
    } else {
        mario.style.backgroundImage = "url('imagens/mario.jpg')";
    }
    
    // Verificar conquista
    const conquista = document.getElementById('conquista');
    if (progresso >= 100) {
        conquista.style.display = 'block';
    } else {
        conquista.style.display = 'none';
    }
}

// Inicializar quando a página carregar
document.addEventListener('DOMContentLoaded', function() {
    // Adicionar evento ao botão
    const button = document.querySelector('.btn[onclick]');
    button.addEventListener('click', atualizar);
    
    // Inicializar com o valor padrão
    atualizar();
}); 