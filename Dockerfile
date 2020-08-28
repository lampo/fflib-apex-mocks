FROM appirio/dx:3.0.1.191186

WORKDIR /app

COPY run.sh .

CMD ["/app/run.sh"]
