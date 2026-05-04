document.addEventListener('DOMContentLoaded', function () {

  const forms = document.querySelectorAll('.php-email-form');

  forms.forEach(function(form) {

    form.addEventListener('submit', function(e) {
      e.preventDefault();

      const action = form.getAttribute('action');
      const formData = new FormData(form);

      form.querySelector('.loading').classList.add('d-block');

      fetch(action, {
        method: 'POST',
        body: formData
      })
      .then(res => res.text())
      .then(data => {
        form.querySelector('.loading').classList.remove('d-block');

        if (data.trim() === 'OK') {
          form.querySelector('.sent-message').classList.add('d-block');
          form.reset();
        } else {
          throw new Error(data);
        }
      })
      .catch(err => {
        form.querySelector('.loading').classList.remove('d-block');
        form.querySelector('.error-message').innerText = err;
        form.querySelector('.error-message').classList.add('d-block');
      });

    });

  });

});